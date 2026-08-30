import { strict as assert } from "node:assert";
import { validateToolCall } from "../src/tool-gate.js";

const result = validateToolCall({
  role: "ARCHITECT",
  repository: "/tmp/devmesh-test",
  call: {
    id: "call-unauthorized",
    name: "write_file",
    arguments: {
      path: "math.ts",
      content: "malicious"
    }
  }
});

assert.equal(
  result.allowed,
  false,
  "Unauthorized tool calls must be rejected before execution."
);

assert.match(
  result.reason,
  /not authorized/i
);

assert.equal(
  result.call,
  undefined,
  "Rejected calls must not produce an executable normalized call."
);

console.log(
  "PASS: DevMesh provider-path tool-call gate"
);
