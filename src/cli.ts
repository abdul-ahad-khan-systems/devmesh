import "dotenv/config";
import { runMesh } from "./orchestrator.js";
import type { DevTask } from "./types.js";

const task: DevTask = {
  id: `devmesh-${Date.now()}`,
  title: "DevMesh integration test",
  description:
    "Analyze this task and report whether the DevMesh execution pipeline is correctly connected. Do not modify files.",
  constraints: [
    "Do not modify the repository.",
    "Do not claim tests were executed unless they actually were."
  ],
  acceptanceCriteria: [
    "Explain the architecture assessment.",
    "Identify any obvious integration risks.",
    "Return a concise review."
  ]
};

try {
  const report = await runMesh(task);

  console.log("\n=== DEVMESH RESULT ===");
  console.log(`Decision: ${report.decision}`);
  console.log(`Architecture:\n${report.architecture.text}`);
  console.log(`Implementation:\n${report.implementation.text}`);

  for (const [index, review] of report.reviews.entries()) {
    console.log(`\nReview ${index + 1}: ${review.verdict}`);
    console.log(review.result.text);
  }

  console.log("\nValidation:");
  console.log(report.validation.output);

  console.log("\nTrace events:", report.trace.events.length);
} catch (error) {
  console.error(
    "DevMesh failed:",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
}
