import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repo = await mkdtemp(
  join(tmpdir(), "devmesh-validation-")
);

try {
  await writeFile(
    join(repo, "package.json"),
    JSON.stringify({
      scripts: {
        check: "node -e \"process.exit(0)\""
      }
    }),
    "utf8"
  );

  const { stdout, stderr } =
    await execFileAsync(
      "npm",
      ["run", "check"],
      {
        cwd: repo,
        maxBuffer: 5 * 1024 * 1024
      }
    );

  assert.match(
    stdout + stderr,
    /check/,
    "Validation command must actually execute."
  );

  let failed = false;

  try {
    await execFileAsync(
      "node",
      ["-e", "process.exit(1)"],
      {
        cwd: repo,
        maxBuffer: 5 * 1024 * 1024
      }
    );
  } catch {
    failed = true;
  }

  assert.equal(
    failed,
    true,
    "Failed executable validation must be observable."
  );

  console.log(
    "PASS: DevMesh validation integrity gate"
  );
} finally {
  await rm(repo, {
    recursive: true,
    force: true
  });
}
