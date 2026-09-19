import { strict as assert } from "node:assert";
import { ModelRegistry } from "../src/registry.js";
import { route, requiredParameters } from "../src/router.js";
import { runProvider } from "../src/providers.js";

const originalFetch = globalThis.fetch;
const originalOverride = process.env.FRELLM_MODEL;
const originalKey = process.env.FRELLM_API_KEY;
const originalModelEnv = process.env.FRELLMAPI_MODEL;

try {
  // Fix #5: an FRELLM_MODEL override lacking the role's required
  // capabilities must be rejected, not silently accepted.
  {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("/v1/models")) {
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
                supported_parameters: ["reasoning_effort", "tools", "tool_choice"]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    process.env.FRELLM_API_KEY = "test-key";
    const registry = new ModelRegistry("http://127.0.0.1:3001", "test-key");
    await registry.refresh();

    const task = {
      id: "override-capability-gate",
      title: "Override capability gate",
      description: "Verify FRELLM_MODEL override respects role capability requirements.",
      constraints: [],
      acceptanceCriteria: []
    };

    process.env.FRELLM_MODEL = "model-incapable";
    assert.throws(
      () => route("IMPLEMENTER", task, "", registry),
      /does not satisfy/,
      "An override model lacking required capabilities (tools/tool_choice for IMPLEMENTER) must be rejected."
    );

    process.env.FRELLM_MODEL = "model-capable";
    const routedImplementer = route("IMPLEMENTER", task, "", registry);
    assert.equal(
      routedImplementer.model,
      "model-capable",
      "A capable override model must still be accepted for IMPLEMENTER."
    );

    const routedRepairer = route("REPAIRER", task, "", registry);
    assert.equal(
      routedRepairer.model,
      "model-capable",
      "A capable override model must still be accepted for REPAIRER."
    );

    delete process.env.FRELLM_MODEL;
  }

  // Normal (non-override) selection must not choose an incapable model,
  // and must respect the 65536 context-window threshold.
  {
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("/v1/models")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "model-incapable-big-context",
                available: true,
                context_window: 262144,
                supported_parameters: ["temperature"]
              },
              {
                id: "model-capable-small-context",
                available: true,
                context_window: 32768,
                supported_parameters: ["reasoning_effort", "tools", "tool_choice"]
              },
              {
                id: "model-capable-sufficient-context",
                available: true,
                context_window: 65536,
                supported_parameters: ["reasoning_effort", "tools", "tool_choice"]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const registry = new ModelRegistry("http://127.0.0.1:3001", "test-key");
    await registry.refresh();

    const task = {
      id: "normal-selection-gate",
      title: "Normal selection gate",
      description: "Verify normal selection excludes incapable models and respects context-window threshold.",
      constraints: [],
      acceptanceCriteria: []
    };

    const routed = route("IMPLEMENTER", task, "", registry);
    assert.equal(
      routed.model,
      "model-capable-sufficient-context",
      "Normal selection must pick the capable model meeting the 65536 context-window threshold, " +
      "excluding the incapable model despite its larger context window, and excluding the capable " +
      "model whose context window falls below the threshold."
    );
  }

  // Fix #6: when the registry has no capable candidate at all,
  // runProvider must fail closed rather than silently falling back
  // to an unfiltered static env model.
  {
    process.env.FRELLMAPI_MODEL = "should-never-be-used";

    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("/v1/models")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "model-incapable",
                available: true,
                context_window: 131072,
                supported_parameters: ["temperature"]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected request during fallback test: ${url}`);
    };

    const registry = new ModelRegistry("http://127.0.0.1:3001", "test-key");
    await registry.refresh();

    const task = {
      id: "no-capable-model-gate",
      title: "No capable model gate",
      description: "Verify no-candidate routing fails closed instead of using an unfiltered fallback.",
      constraints: [],
      acceptanceCriteria: []
    };

    const routed = route("IMPLEMENTER", task, "", registry);
    assert.equal(
      routed.model,
      undefined,
      "route() must not select an incapable model when no capable candidate exists."
    );

    await assert.rejects(
      runProvider(
        "freellmapi",
        {
          role: "IMPLEMENTER",
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            constraints: [],
            acceptanceCriteria: []
          },
          context: "",
          instructions: "Should never actually run."
        },
        routed.model,
        registry,
        requiredParameters("IMPLEMENTER")
      ),
      /All capable models failed/,
      "runProvider must fail closed rather than silently using the unfiltered static env model when no capable candidate exists."
    );
  }

  console.log("PASS: DevMesh model capability routing gate");
} finally {
  globalThis.fetch = originalFetch;

  if (originalOverride === undefined) delete process.env.FRELLM_MODEL;
  else process.env.FRELLM_MODEL = originalOverride;

  if (originalKey === undefined) delete process.env.FRELLM_API_KEY;
  else process.env.FRELLM_API_KEY = originalKey;

  if (originalModelEnv === undefined) delete process.env.FRELLMAPI_MODEL;
  else process.env.FRELLMAPI_MODEL = originalModelEnv;
}
