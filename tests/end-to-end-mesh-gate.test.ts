import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repository = await mkdtemp(
  join(tmpdir(), "devmesh-e2e-")
);

const execFileAsync = promisify(execFile);

await execFileAsync(
  "git",
  ["init"],
  { cwd: repository }
);

await execFileAsync(
  "git",
  ["config", "user.name", "DevMesh E2E"],
  { cwd: repository }
);

await execFileAsync(
  "git",
  ["config", "user.email", "devmesh-e2e@example.invalid"],
  { cwd: repository }
);

await execFileAsync(
  "git",
  ["commit", "--allow-empty", "-m", "baseline"],
  { cwd: repository }
);

const originalValidation =
  process.env.DEVMESH_VALIDATION_COMMAND;

process.env.DEVMESH_VALIDATION_COMMAND = "true";

let callCount = 0;

const server = createServer(async (request, response) => {
  if (request.url === "/v1/models") {
    response.writeHead(200, {
      "content-type": "application/json"
    });

    response.end(JSON.stringify({
      data: [{
        id: "e2e-model",
        available: true,
        context_window: 65536,
        supported_parameters: [
          "reasoning_effort",
          "tools",
          "tool_choice"
        ]
      }]
    }));

    return;
  }

  if (request.url === "/v1/chat/completions") {
    let body = "";

    for await (const chunk of request) {
      body += chunk;
    }

    const payload = JSON.parse(body) as {
      messages?: Array<{
        role?: string;
      }>;
    };

    const messages = payload.messages ?? [];
      const systemContent = String(
        (messages.find(message => message.role === "system") as {
          content?: unknown
        } | undefined)?.content ?? ""
      );

      const role =
        systemContent.match(
          /\b(ARCHITECT|IMPLEMENTER|REVIEWER|ALTERNATIVE_REVIEWER|VALIDATOR|REPAIRER)\b/
        )?.[1];

    callCount++;

    const requestText = JSON.stringify(payload);

    response.writeHead(200, {
      "content-type": "application/json"
    });

      if (
        requestText.includes("IMPLEMENTER") &&
        !messages.some(message => message.role === "tool")
      ) {
      response.end(JSON.stringify({
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: `call-${callCount}`,
              type: "function",
              function: {
                name: "write_file",
                arguments: JSON.stringify({
                  path: "e2e.txt",
                  content: "DevMesh E2E mutation\n"
                })
              }
            }]
          }
        }]
      }));

      return;
    }

    response.end(JSON.stringify({
      choices: [{
        message: {
          role: "assistant",
          content:
            role === "ARCHITECT"
              ? "Architecture: controlled end-to-end pipeline."
              : "PASS: implementation and repository evidence are correct."
        }
      }]
    }));
  }
});

await new Promise<void>(resolve =>
  server.listen(0, "127.0.0.1", resolve)
);

const address = server.address();

assert.notEqual(
  address,
  null,
  "E2E fixture server must start."
);

const port =
  typeof address === "object" && address
    ? address.port
    : 0;

process.env.FRELLM_BASE_URL =
  `http://127.0.0.1:${port}`;

process.env.FRELLM_API_KEY =
  "e2e-test-key";


const { runMesh } =
  await import("../src/orchestrator.js");


try {
  const report = await runMesh({
    id: `e2e-${Date.now()}`,
    title: "Controlled DevMesh E2E",
    description:
      "Create the requested marker file and validate the complete execution pipeline.",
    repository,
    constraints: [
      "Modify only e2e.txt.",
      "Do not claim validation without executable evidence."
    ],
    acceptanceCriteria: [
      "e2e.txt exists with the requested content.",
      "The final mesh decision reflects successful validation and review."
    ]
  });

  const created = await readFile(
    join(repository, "e2e.txt"),
    "utf8"
  );

  assert.equal(
    created,
    "DevMesh E2E mutation\n",
    "The model tool call must produce the repository mutation."
  );

  assert.equal(
    report.validation.attempted,
    true,
    "Validation must actually execute."
  );

  assert.equal(
    report.validation.passed,
    true,
    "Executable validation must pass."
  );

  assert.equal(
    report.decision,
    "PASS",
    "The complete pipeline must produce PASS."
  );

  assert.ok(
    report.trace.events.some(
      event => event.type === "VALIDATION_STARTED"
    ),
    "Trace must contain validation start."
  );

  assert.ok(
    report.trace.events.some(
      event => event.type === "VALIDATION_COMPLETED"
    ),
    "Trace must contain validation completion."
  );

  assert.ok(
    report.trace.events.some(
      event => event.type === "DECISION_MADE"
    ),
    "Trace must contain the final decision."
  );

  assert.ok(
    callCount >= 4,
    "The E2E pipeline must exercise multiple model roles."
  );

  console.log(
    "PASS: DevMesh end-to-end mesh gate"
  );
} finally {
  server.close();

  if (
    originalValidation === undefined
  ) {
    delete process.env.DEVMESH_VALIDATION_COMMAND;
  } else {
    process.env.DEVMESH_VALIDATION_COMMAND =
      originalValidation;
  }

  delete process.env.FRELLM_BASE_URL;
  delete process.env.FRELLM_API_KEY;

  await rm(repository, {
    recursive: true,
    force: true
  });
}
