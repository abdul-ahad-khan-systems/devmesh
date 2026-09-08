import { strict as assert } from "node:assert";
import { ModelRegistry } from "../src/registry.js";
import { runProvider } from "../src/providers.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.FRELLM_API_KEY;
const originalModel = process.env.FRELLMAPI_MODEL;

let requests = 0;
let completedToolRounds = 0;

try {
  process.env.FRELLM_API_KEY = "test-key";
  process.env.FRELLMAPI_MODEL = "model-round-limit";

  const registry = new ModelRegistry(
    "http://127.0.0.1:3001",
    "test-key"
  );

  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = String(input);

    if (url.endsWith("/v1/models")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "model-round-limit",
              available: true,
              context_window: 65536,
              supported_parameters: [
                "reasoning_effort",
                "tools",
                "tool_choice"
              ]
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    if (url.endsWith("/v1/chat/completions")) {
      requests++;

      if (requests > 32) {
        throw new Error("Round 33 executed unexpectedly.");
      }

      completedToolRounds++;

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `round-${requests}`,
                    type: "function",
                    function: {
                      name: "list_files",
                      arguments: JSON.stringify({ path: "." })
                    }
                  }
                ]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  await registry.refresh();

  await assert.rejects(
    runProvider(
      "freellmapi",
      {
        role: "IMPLEMENTER",
        task: {
          id: "tool-round-limit-gate",
          repository: process.cwd(),
          title: "Tool round limit gate",
          description: "Verify the exact executable tool-round limit.",
          constraints: [],
          acceptanceCriteria: []
        },
        context: "",
        instructions: "Use the available tool repeatedly."
      },
      "model-round-limit",
      registry,
      ["tools", "tool_choice"]
    ),
    /Tool-call limit exceeded after 32 rounds/,
    "The provider must stop after exactly 32 executable rounds."
  );

  assert.equal(
    completedToolRounds,
    32,
    "Exactly 32 executable rounds must be permitted."
  );

  assert.equal(
    requests,
    32,
    "Round 33 must never execute."
  );

  console.log(
    "PASS: DevMesh exact 32-round execution-limit gate"
  );
} finally {
  globalThis.fetch = originalFetch;

  if (originalKey === undefined) {
    delete process.env.FRELLM_API_KEY;
  } else {
    process.env.FRELLM_API_KEY = originalKey;
  }

  if (originalModel === undefined) {
    delete process.env.FRELLMAPI_MODEL;
  } else {
    process.env.FRELLMAPI_MODEL = originalModel;
  }
}
