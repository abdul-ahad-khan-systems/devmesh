import "dotenv/config";
import { runMesh } from "./dist/orchestrator.js";

const task = {
  id: `e2e-${Date.now()}`,
  title: "Implement add function",
  description:
    "Inspect math.ts and implement the add function so it returns the sum of its two numeric arguments. Modify the repository as necessary.",
  repository: process.env.HOME + "/devmesh-e2e",
  constraints: [
    "Only modify files necessary for this task.",
    "Do not modify math.test.mjs; it is the provided validation fixture.",
    "Do not create package.json or other project configuration.",
    "Do not create temporary files or directories outside the repository.",
    "Do not perform environment-probing commands such as which or --version.",
    "Do not claim validation succeeded unless executable evidence supports it."
  ],
  acceptanceCriteria: [
    "math.ts exports add.",
    "add(2, 3) returns 5.",
    "The implementation must not simply return a constant.",
    "Run the provided executable validation with: node --experimental-strip-types math.test.mjs",
    "Validation must produce executable evidence before claiming success."
  ]
};

const report = await runMesh(task);

console.log("\n=== E2E RESULT ===");
console.log("Decision:", report.decision);
console.log("Validation:", report.validation.passed);
console.log("Trace events:", report.trace.events.length);
console.log("\nImplementation:");
console.log(report.implementation.text);
