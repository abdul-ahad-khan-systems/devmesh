import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeToolCall } from "../src/tools.js";

const repo = await mkdtemp(
  join(tmpdir(), "devmesh-mutation-")
);

try {
  const target = join(repo, "target.txt");

  await writeFile(
    target,
    "before\n",
    "utf8"
  );

  const result = await executeToolCall(
    repo,
    {
      id: "mutation-1",
      name: "write_file",
      arguments: {
        path: "target.txt",
        content: "after\n"
      }
    }
  );

  assert.equal(
    result.success,
    true,
    "Authorized repository mutation must execute."
  );

  assert.equal(
    await readFile(target, "utf8"),
    "after\n",
    "Mutation must affect only the requested repository file."
  );

  const escape = await executeToolCall(
    repo,
    {
      id: "mutation-2",
      name: "write_file",
      arguments: {
        path: "../outside.txt",
        content: "escaped\n"
      }
    }
  );

  assert.equal(
    escape.success,
    false,
    "Repository-escaping writes must be rejected."
  );

  console.log(
    "PASS: DevMesh repository mutation integrity gate"
  );
} finally {
  await rm(repo, {
    recursive: true,
    force: true
  });
}
