import { strict as assert } from "node:assert";
import {
  validateToolCall
} from "../src/tool-gate.js";

const repository = "/tmp/devmesh-test";

const validCall = {
  id: "call-1",
  name: "read_file",
  arguments: {
    path: "math.ts"
  }
};

assert.equal(
  validateToolCall({
    role: "IMPLEMENTER",
    repository,
    call: validCall
  }).allowed,
  true
);

const unknownToolResult = validateToolCall({
  role: "IMPLEMENTER",
  repository,
  call: {
    id: "call-2",
    name: "delete_everything",
    arguments: {}
  }
});

assert.equal(
  unknownToolResult.allowed,
  false,
  "Unknown tools must be rejected."
);

assert.match(
  unknownToolResult.reason,
  /delete_everything/,
  "Unknown-tool rejection must identify the rejected tool."
);

assert.equal(
  validateToolCall({
    role: "IMPLEMENTER",
    repository,
    call: {
      id: "call-3",
      name: "read_file",
      arguments: "not-an-object"
    }
  }).allowed,
  false,
  "Malformed arguments must be rejected."
);

assert.equal(
  validateToolCall({
    role: "IMPLEMENTER",
    call: validCall
  }).allowed,
  false,
  "Repository-bound calls require a repository."
);

assert.equal(
  validateToolCall({
    role: "ARCHITECT",
    repository,
    call: validCall
  }).allowed,
  false,
  "Non-execution roles must not invoke execution tools."
);

assert.equal(
  validateToolCall({
    role: "IMPLEMENTER",
    repository,
    call: {
      id: "",
      name: "read_file",
      arguments: {
        path: "math.ts"
      }
    }
  }).allowed,
  false,
  "Tool calls require an identity."
);

console.log(
  "PASS: DevMesh tool-call integrity gate"
);
