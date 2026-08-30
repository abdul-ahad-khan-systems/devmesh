import { strict as assert } from "node:assert";
import { runMesh } from "../src/orchestrator.js";

const previousKey = process.env.FRELLM_API_KEY;

delete process.env.FRELLM_API_KEY;

try {
  await assert.rejects(
    () =>
      runMesh({
        id: `provider-readiness-${Date.now()}`,
        title: "Provider readiness gate",
        description: "Verify provider configuration before mesh execution.",
        constraints: [],
        acceptanceCriteria: []
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /Provider readiness failed: freellmapi/
      );
      assert.match(
        error.message,
        /Provider API key is not configured/
      );
      return true;
    }
  );

  console.log("PASS: DevMesh provider readiness gate");
} finally {
  if (previousKey === undefined) {
    delete process.env.FRELLM_API_KEY;
  } else {
    process.env.FRELLM_API_KEY = previousKey;
  }
}
