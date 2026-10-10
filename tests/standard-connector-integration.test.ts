import { strict as assert } from "node:assert";
import { executeStandardConnectorTool } from "../src/integrations/standard-connector.js";

const repository = "/home/kali/Projects/devmesh-v0.1";

const allowed = await executeStandardConnectorTool(
  repository,
  "IMPLEMENTER",
  {
    id: "sc-call-001",
    name: "list_files",
    arguments: {
      path: "."
    }
  }
);

assert.equal(allowed.gate.allowed, true);
assert.equal(allowed.result.success, true);
assert.equal(allowed.result.toolCallId, "sc-call-001");
assert.equal(allowed.result.name, "list_files");

const denied = await executeStandardConnectorTool(
  repository,
  "ARCHITECT",
  {
    id: "sc-call-002",
    name: "write_file",
    arguments: {
      path: "blocked.txt",
      content: "must not execute"
    }
  }
);

assert.equal(denied.gate.allowed, false);
assert.equal(denied.result.success, false);
assert.equal(denied.result.toolCallId, "sc-call-002");

console.log("PASS: Standard Connector DevMesh integration boundary");
