import { config } from "./config.js";
import { ModelRegistry } from "./registry.js";
import type { DevTask, ModelRequest, ProviderName, Role } from "./types.js";

export interface RoutedTask {
  role: Role;
  provider: ProviderName;
  model?: string;
  request: ModelRequest;
}

const instructions: Record<Role, string> = {
  ARCHITECT:
    "Analyze the task before implementation. Identify affected contracts, invariants, risks, and tests. Do not invent repository facts.",

  IMPLEMENTER:
    "Implement the approved task directly in the supplied repository. Follow this sequence: inspect the relevant files, determine the smallest correct change, make the required repository edits, then validate them. Do not merely describe a solution. Do not repeatedly rediscover the environment. Do not create temporary projects, files, or directories outside the supplied repository. Do not modify files unrelated to the task. After the requested change is implemented and adequately validated, stop and report exactly what changed and what validation was performed.",

  REVIEWER:
    "Independently review the proposed work for correctness, regressions, security, architecture violations, missing tests, and unsupported claims.",

  ALTERNATIVE_REVIEWER:
    "Provide an independent second review. Challenge assumptions and identify issues the primary reviewer may have missed.",

  VALIDATOR:
    "Evaluate executable validation evidence. Do not treat an AI assertion as proof that the implementation works.",

  REPAIRER:
    "Diagnose the validated failure and implement the smallest safe repair. Inspect the repository before changing anything. Preserve existing contracts and report exactly what was changed."
};

const requirements: Record<Role, string[]> = {
  ARCHITECT: ["reasoning_effort"],
  IMPLEMENTER: ["tools", "tool_choice"],
  REVIEWER: ["reasoning_effort"],
  ALTERNATIVE_REVIEWER: ["reasoning_effort"],
  VALIDATOR: [],
  REPAIRER: ["tools", "tool_choice"]
};

export function requiredParameters(role: Role): string[] {
  return requirements[role];
}

function selectModel(
  role: Role,
  provider: ProviderName,
  registry?: ModelRegistry
): string | undefined {
  // Only FreeLLMAPI owns the dynamic registry.
  // Other providers retain their own configured model.
  if (provider !== "freellmapi" || !registry) {
    return undefined;
  }

  return registry.best(requirements[role], 65536)?.id;
}

export function route(
  role: Role,
  task: DevTask,
  context = "",
  registry?: ModelRegistry
): RoutedTask {
  const provider = config.roles[role];
  const model = selectModel(role, provider, registry);

  return {
    role,
    provider,
    model,
    request: {
      role,
      task,
      context,
      instructions: instructions[role]
    }
  };
}
