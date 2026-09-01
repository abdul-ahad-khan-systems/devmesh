import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  captureRepository,
  repositoryEvidence
} from "../src/repository.js";

const execFileAsync = promisify(execFile);

const repo = await mkdtemp(
  join(tmpdir(), "devmesh-evidence-")
);

try {
  const git = async (...args: string[]) =>
    execFileAsync("git", [
      "-C",
      repo,
      ...args
    ]);

  await git("init");
  await git("config", "user.name", "DevMesh Test");
  await git("config", "user.email", "devmesh@example.invalid");

  await writeFile(
    join(repo, "tracked.txt"),
    "original\n",
    "utf8"
  );

  await git("add", "tracked.txt");
  await git("commit", "-m", "baseline");

  const before = await captureRepository(repo);

  await writeFile(
    join(repo, "tracked.txt"),
    "changed\n",
    "utf8"
  );

  await writeFile(
    join(repo, "new.txt"),
    "untracked\n",
    "utf8"
  );

  const after = await captureRepository(repo);
  const evidence = repositoryEvidence(before, after);

  assert.match(
    evidence,
    /tracked\.txt/,
    "Modified tracked files must appear."
  );

  assert.match(
    evidence,
    /new\.txt/,
    "Untracked files must appear."
  );

  assert.match(
    evidence,
    /changed/,
    "Unstaged diff content must remain visible."
  );

  assert.match(
    evidence,
    /STATUS BEFORE:/,
    "Evidence must include the before state."
  );

  assert.match(
    evidence,
    /STATUS AFTER:/,
    "Evidence must include the after state."
  );

  console.log(
    "PASS: DevMesh repository mutation evidence gate"
  );
} finally {
  await rm(repo, {
    recursive: true,
    force: true
  });
}
