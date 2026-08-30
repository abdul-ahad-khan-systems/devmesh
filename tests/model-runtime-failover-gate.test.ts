import { strict as assert } from "node:assert";
import { ModelRegistry } from "../src/registry.js";
import { runProvider } from "../src/providers.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.FRELLM_API_KEY;
const originalModel = process.env.FRELLMAPI_MODEL;

const attemptedModels: string[] = [];

try {
  process.env.FRELLM_API_KEY = "test-key";
  process.env.FRELLMAPI_MODEL = "model-primary";

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
              id: "model-primary",
              available: true,
              context_window: 65536,
              supported_parameters: [
                "reasoning_effort",
                "tools",
                "tool_choice"
              ]
            },
            {
              id: "model-fallback",
              available: true,
              context_window: 65536,
              supported_parameters: [
                "reasoning_effort",
                "tools",
                "tool_choice"
              ]
            },
            {
              id: "model-incapable",
              available: true,
              context_window: 131072,
              supported_parameters: ["temperature"]
            },
            {
              id: "model-unavailable",
              available: false,
              context_window: 262144,
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
      const body = JSON.parse(
        String(init?.body ?? "{}")
      ) as {
        model?: string;
      };

      const model = body.model ?? "";
      attemptedModels.push(model);

      if (model === "model-primary") {
        return new Response(
          JSON.stringify({
            error: {
              message: "model temporarily unavailable"
            }
          }),
          {
            status: 503,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (model === "model-fallback") {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "fallback succeeded"
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

      throw new Error(
        `Unexpected model attempted: ${model}`
      );
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  await registry.refresh();

  const result = await runProvider(
    "freellmapi",
    {
      role: "ARCHITECT",
      task: {
        id: "runtime-failover-gate",
        title: "Runtime failover gate",
        description: "Verify provider model failover.",
        constraints: [],
        acceptanceCriteria: []
      },
      context: "",
      instructions: "Return a concise architecture assessment."
    },
    "model-primary",
    registry,
    ["reasoning_effort"]
  );

  assert.equal(
    result.text,
    "fallback succeeded"
  );

  assert.deepEqual(
    attemptedModels,
    [
      "model-primary",
      "model-fallback"
    ],
    "Failover must proceed only through registry-approved capable models."
  );

  assert.equal(
    attemptedModels.includes("model-incapable"),
    false
  );

  assert.equal(
    attemptedModels.includes("model-unavailable"),
    false
  );

  console.log(
    "PASS: DevMesh runtime model failover gate"
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
