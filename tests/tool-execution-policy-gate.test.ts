import { strict as assert } from "node:assert";
import { executeToolCall } from "../src/tools.js";

const repository = process.cwd();

const blocked = await executeToolCall(
  repository,
  {
    id: "exec-1",
    name: "run_command",
    arguments: {
      command: "pwd"
    }
  }
);

assert.equal(
  blocked.success,
  false,
  "Blocked commands must not execute through the tool boundary."
);

assert.match(
  blocked.output,
  /Environment-probing.*blocked/i
);

const allowed = await executeToolCall(
  repository,
  {
    id: "exec-2",
    name: "run_command",
    arguments: {
      command: "git status --short"
    }
  }
);

assert.equal(
  allowed.success,
  true,
  "Allowed repository commands must still execute."
);

console.log(
  "PASS: DevMesh tool execution policy boundary"
);
