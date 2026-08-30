import { strict as assert } from "node:assert";
import { ModelRegistry } from "../src/registry.js";
import { route, requiredParameters } from "../src/router.js";

const originalFetch = globalThis.fetch;

try {
  const registry = new ModelRegistry(
    "http://127.0.0.1:3001",
    "test-key"
  );

  globalThis.fetch = async (
    input: string | URL | Request
  ): Promise<Response> => {
    assert.match(
      String(input),
      /\/v1\/models$/,
      "Registry test must query the models endpoint."
    );

    return new Response(
      JSON.stringify({
        data: [
          {
            id: "model-incapable",
            available: true,
            context_window: 131072,
            supported_parameters: ["temperature"]
          },
          {
            id: "model-capable",
            available: true,
            context_window: 65536,
            supported_parameters: [
              "reasoning_effort",
              "tools",
              "tool_choice"
            ]
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
  };

  await registry.refresh();

  const candidates = registry.ranked(
    requiredParameters("ARCHITECT"),
    65536
  );

  assert.deepEqual(
    candidates.map(model => model.id),
    ["model-capable"],
    "Only an available capable model may be eligible."
  );

  assert.equal(
    registry.get("model-unavailable")?.available,
    false
  );

  assert.equal(
    registry.get("model-incapable")?.available,
    true
  );

  const task = {
    id: "model-selection-gate",
    title: "Model selection gate",
    description: "Verify deterministic model selection.",
    constraints: [],
    acceptanceCriteria: []
  };

  const routed = route(
    "ARCHITECT",
    task,
    "",
    registry
  );

  assert.equal(
    routed.provider,
    "freellmapi"
  );

  assert.equal(
    routed.model,
    "model-capable",
    "Routing must select an available capable model."
  );

  const eligibleIds = registry
    .ranked(requiredParameters("ARCHITECT"), 65536)
    .map(model => model.id);

  assert.equal(
    eligibleIds.includes("model-incapable"),
    false
  );

  assert.equal(
    eligibleIds.includes("model-unavailable"),
    false
  );

  console.log(
    "PASS: DevMesh model selection and capability gate"
  );
} finally {
  globalThis.fetch = originalFetch;
}
