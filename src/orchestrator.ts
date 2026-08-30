import { exec } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { route, requiredParameters } from "./router.js";
import { ModelRegistry } from "./registry.js";
import { checkProviderHealth, runProvider } from "./providers.js";
import { MeshTrace } from "./trace.js";
import { captureRepository, repositoryEvidence, type RepositorySnapshot } from "./repository.js";

import type {
  DevTask,
  MeshDecision,
  MeshReport,
  ModelResult,
  ReviewResult
} from "./types.js";

const execAsync = promisify(exec);

function parseReview(result: ModelResult): ReviewResult {
  const text = result.text.toUpperCase();

  let verdict: ReviewResult["verdict"] = "CONDITIONAL";

  if (/\bFAIL\b/.test(text)) {
    verdict = "FAIL";
  } else if (/\bPASS\b/.test(text)) {
    verdict = "PASS";
  }

  return {
    result,
    verdict,
    findings: result.text
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 12)
  };
}

function hasReviewConflict(reviews: ReviewResult[]): boolean {
  return new Set(reviews.map(review => review.verdict)).size > 1;
}

async function validate(
  task: DevTask,
  trace: MeshTrace
) {
  if (!task.repository) {
    trace.emit(
      task.id,
      "VALIDATION_COMPLETED",
      "Validation not attempted: no repository supplied."
    );

    return {
      attempted: false,
      passed: false,
      command: undefined,
      output: "Validation not attempted: no repository supplied."
    };
  }

  trace.emit(
    task.id,
    "VALIDATION_STARTED",
    `Running validation command: ${config.validationCommand}`,
    {
      metadata: {
        repository: task.repository
      }
    }
  );

  try {
    const result = await execAsync(
      config.validationCommand,
      {
        cwd: task.repository,
        maxBuffer: 10 * 1024 * 1024
      }
    );

    const output = result.stdout + result.stderr;

    trace.emit(
      task.id,
      "VALIDATION_COMPLETED",
      "Validation completed successfully."
    );

    return {
      attempted: true,
      passed: true,
      command: config.validationCommand,
      output
    };
  } catch (error: any) {
    const output =
      `${error.stdout ?? ""}${error.stderr ?? ""}` ||
      String(error);

    trace.emit(
      task.id,
      "VALIDATION_COMPLETED",
      "Validation failed.",
      {
        metadata: {
          error: output
        }
      }
    );

    return {
      attempted: true,
      passed: false,
      command: config.validationCommand,
      output
    };
  }
}

async function runRole(
  trace: MeshTrace,
  task: DevTask,
  role: Parameters<typeof route>[0],
  context = "",
  registry: ModelRegistry
): Promise<ModelResult> {
  const routed = route(role, task, context, registry);

  console.log(
    `[DevMesh] ${role} → ${routed.provider}` +
    `${routed.model ? `/${routed.model}` : ""}`
  );

  trace.emit(
    task.id,
    "ROLE_STARTED",
    `${role} started using ${routed.provider}.`,
    {
      role,
      provider: routed.provider
    }
  );

  try {
    const result = await runProvider(
      routed.provider,
      routed.request,
      routed.model,
      registry,
      requiredParameters(role)
    );

    console.log(
      `[DevMesh] ${role} ✓ ${result.latencyMs}ms`
    );

    trace.emit(
      task.id,
      "ROLE_COMPLETED",
      `${role} completed using ${routed.provider}.`,
      {
        role,
        provider: routed.provider,
        metadata: {
          latencyMs: result.latencyMs
        }
      }
    );

    return result;
  } catch (error) {
    console.error(
      `[DevMesh] ${role} ✗`,
      error instanceof Error
        ? error.message
        : String(error)
    );

    trace.emit(
      task.id,
      "ROLE_FAILED",
      `${role} failed.`,
      {
        role,
        provider: routed.provider,
        metadata: {
          error:
            error instanceof Error
              ? error.message
              : String(error)
        }
      }
    );

    throw error;
  }
}

export async function runMesh(
  task: DevTask
): Promise<MeshReport> {
  const trace = new MeshTrace(task.id);

  let repositoryBefore: RepositorySnapshot | undefined;
  let repositoryAfter: RepositorySnapshot | undefined;

  if (task.repository) {
    repositoryBefore = await captureRepository(task.repository);
    trace.emit(
      task.id,
      "TASK_RECEIVED",
      "Repository snapshot captured before execution.",
      { metadata: { branch: repositoryBefore.branch } }
    );
  }

  const registryBaseUrl =
    process.env.FREELLM_BASE_URL?.replace(/\/v1\/?$/, "") ??
    "http://127.0.0.1:3001";

  const registryApiKey =
    process.env.FRELLM_API_KEY ?? "";

  const registry = new ModelRegistry(
    registryBaseUrl,
    registryApiKey
  );

  const providers = [
    ...new Set(
      Object.values(config.roles)
    )
  ];

  for (const provider of providers) {
    const health = await checkProviderHealth(provider);

    if (!health.available) {
      throw new Error(
        `[DevMesh] Provider readiness failed: ${provider}` +
        `${health.message ? ` — ${health.message}` : ""}`
      );
    }
  }

  if (providers.includes("freellmapi")) {
    await registry.refresh();
  }

  const architecture = await runRole(
    trace,
    task,
    "ARCHITECT",
    "",
    registry
  );

  const implementation = await runRole(
    trace,
    task,
    "IMPLEMENTER",
    `ARCHITECTURE PLAN:\n${architecture.text}`,
    registry
  );

  if (task.repository) {
    repositoryAfter = await captureRepository(task.repository);
  }

  const evidence =
    repositoryBefore && repositoryAfter
      ? repositoryEvidence(repositoryBefore, repositoryAfter)
      : "REPOSITORY EVIDENCE: unavailable";

  if (repositoryBefore && repositoryAfter) {
    trace.emit(
      task.id,
      "REVIEW_STARTED",
      "Repository evidence reconciled before independent review.",
      {
        metadata: {
          branchBefore: repositoryBefore.branch,
          branchAfter: repositoryAfter.branch,
          changedFileCount: repositoryAfter.changedFiles.length,
          diffPresent: Boolean(repositoryAfter.diff.trim())
        }
      }
    );
  }

  trace.emit(
    task.id,
    "REVIEW_STARTED",
    "Independent review phase started."
  );

  async function runReviews(
    context: string
  ): Promise<ReviewResult[]> {
    const reviewerRequest = route(
      "REVIEWER",
      task,
      context,
      registry
    );

    const alternativeRequest = route(
      "ALTERNATIVE_REVIEWER",
      task,
      context,
      registry
    );

    const [reviewA, reviewB] = await Promise.all([
      runProvider(
        reviewerRequest.provider,
        reviewerRequest.request,
        reviewerRequest.model,
        registry,
        requiredParameters("REVIEWER")
      ),
      runProvider(
        alternativeRequest.provider,
        alternativeRequest.request,
        alternativeRequest.model,
        registry,
        requiredParameters("ALTERNATIVE_REVIEWER")
      )
    ]);

    return [
      parseReview(reviewA),
      parseReview(reviewB)
    ];
  }

  const reviewContext = [
    `ARCHITECTURE PLAN:\n${architecture.text}`,
    `IMPLEMENTATION RESULT:\n${implementation.text}`,
    evidence
  ].join("\n\n");

  let reviews = await runReviews(reviewContext);

  trace.emit(
    task.id,
    "REVIEW_COMPLETED",
    "Independent reviews completed.",
    {
      metadata: {
        primaryVerdict: reviews[0].verdict,
        alternativeVerdict: reviews[1].verdict
      }
    }
  );

  let validation = await validate(
    task,
    trace
  );

  const MAX_REPAIR_ATTEMPTS = 3;
  let repairAttempts = 0;

  while (
    task.repository &&
    !validation.passed &&
    repairAttempts < MAX_REPAIR_ATTEMPTS
  ) {
    repairAttempts++;

    const currentEvidence =
      repositoryBefore
        ? repositoryEvidence(
            repositoryBefore,
            await captureRepository(task.repository)
          )
        : "REPOSITORY EVIDENCE: unavailable";

    trace.emit(
      task.id,
      "ROLE_STARTED",
      `REPAIRER attempt ${repairAttempts} started.`,
      {
        role: "REPAIRER",
        provider: config.roles.REPAIRER,
        metadata: {
          attempt: repairAttempts,
          maxAttempts: MAX_REPAIR_ATTEMPTS
        }
      }
    );

    try {
      const repairResult = await runRole(
        trace,
        task,
        "REPAIRER",
        [
          "VALIDATION FAILURE:",
          validation.output,
          "",
          currentEvidence,
          "",
          "REPAIR REQUIREMENT:",
          "Fix the validated failure with the smallest safe change.",
          "Do not claim success until executable validation passes."
        ].join("\n\n"),
        registry
      );

      trace.emit(
        task.id,
        "ROLE_COMPLETED",
        `REPAIRER attempt ${repairAttempts} completed.`,
        {
          role: "REPAIRER",
          provider: repairResult.provider,
          metadata: {
            attempt: repairAttempts
          }
        }
      );
    } catch (error) {
      trace.emit(
        task.id,
        "ROLE_FAILED",
        `REPAIRER attempt ${repairAttempts} failed.`,
        {
          role: "REPAIRER",
          provider: config.roles.REPAIRER,
          metadata: {
            attempt: repairAttempts,
            error:
              error instanceof Error
                ? error.message
                : String(error)
          }
        }
      );

      break;
    }

    validation = await validate(
      task,
      trace
    );
  }

  if (repairAttempts > 0) {
    if (task.repository) {
      repositoryAfter = await captureRepository(task.repository);
    }

    const finalEvidence =
      repositoryBefore && repositoryAfter
        ? repositoryEvidence(repositoryBefore, repositoryAfter)
        : "REPOSITORY EVIDENCE: unavailable";

    trace.emit(
      task.id,
      "REVIEW_STARTED",
      "Fresh post-repair review phase started.",
      {
        metadata: {
          repairAttempts,
          changedFileCount:
            repositoryAfter?.changedFiles.length ?? 0,
          diffPresent:
            Boolean(repositoryAfter?.diff.trim())
        }
      }
    );

    reviews = await runReviews([
      `ARCHITECTURE PLAN:\n${architecture.text}`,
      `IMPLEMENTATION RESULT:\n${implementation.text}`,
      `REPAIR ATTEMPTS: ${repairAttempts}`,
      finalEvidence,
      `FINAL VALIDATION:\n${validation.output}`
    ].join("\n\n"));

    trace.emit(
      task.id,
      "REVIEW_COMPLETED",
      "Fresh post-repair reviews completed.",
      {
        metadata: {
          primaryVerdict: reviews[0].verdict,
          alternativeVerdict: reviews[1].verdict,
          repairAttempts
        }
      }
    );
  }

  const conflict = hasReviewConflict(reviews);

  const hasRepositoryEvidence =
    !task.repository ||
    (
      repositoryBefore !== undefined &&
      repositoryAfter !== undefined
    );

  const repositoryChanged =
    repositoryBefore !== undefined &&
    repositoryAfter !== undefined &&
    (
      repositoryBefore.status !== repositoryAfter.status ||
      repositoryBefore.diff !== repositoryAfter.diff ||
      repositoryBefore.changedFiles.join("\n") !==
        repositoryAfter.changedFiles.join("\n")
    );

  const noChangeExpected =
    task.description.toLowerCase().includes("do not modify") ||
    task.constraints.some(
      constraint =>
        constraint.toLowerCase().includes("do not modify") ||
        constraint.toLowerCase().includes("no changes")
    );

  const evidenceConsistent =
    hasRepositoryEvidence &&
    (
      !task.repository ||
      repositoryChanged ||
      noChangeExpected
    );

  let decision: MeshDecision = "HUMAN_REVIEW";

  if (
    validation.attempted &&
    validation.passed &&
    !conflict &&
    reviews.every(
      review => review.verdict === "PASS"
    ) &&
    evidenceConsistent
  ) {
    decision = "PASS";
  } else if (
    reviews.some(
      review => review.verdict === "FAIL"
    ) ||
    (
      validation.attempted &&
      !validation.passed
    )
  ) {
    decision = "FAIL";
  }

  trace.emit(
    task.id,
    "DECISION_MADE",
    `DevMesh decision: ${decision}.`,
    {
      metadata: {
        reviewConflict: conflict,
        validationPassed: validation.passed
      }
    }
  );

  return {
    task,
    trace: {
      traceId: trace.traceId,
      events: trace.export()
    },
    architecture,
    implementation,
    reviews,
    validation,
    decision
  };
}
