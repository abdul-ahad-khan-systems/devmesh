import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  captureRepository,
  repositoryEvidence
} from "../src/repository.js";

const execFileAsync = promisify(execFile);

const repository = await mkdtemp(
  join(tmpdir(), "devmesh-repository-evidence-")
);

try {
  await execFileAsync("git", [
    "-C",
    repository,
    "init"
  ]);

  await writeFile(
    join(repository, "tracked.txt"),
    "original\n",
    "utf8"
  );

  await execFileAsync("git", [
    "-C",
    repository,
    "add",
    "tracked.txt"
  ]);

  await execFileAsync("git", [
    "-C",
    repository,
    "-c",
    "user.name=DevMesh Test",
    "-c",
    "user.email=devmesh@example.invalid",
    "commit",
    "-m",
    "baseline"
  ]);

  const before = await captureRepository(repository);

  await writeFile(
    join(repository, "tracked.txt"),
    "staged-change\n",
    "utf8"
  );

  await execFileAsync("git", [
    "-C",
    repository,
    "add",
    "tracked.txt"
  ]);

  const staged = await captureRepository(repository);

  assert.ok(
    staged.changedFiles.includes("tracked.txt"),
    "Staged files must appear in repository evidence."
  );

  assert.match(
    staged.diff,
    /staged-change/,
    "Staged diff must appear in repository evidence."
  );

  await writeFile(
    join(repository, "unstaged.txt"),
    "unstaged-change\n",
    "utf8"
  );

  const mixed = await captureRepository(repository);

  assert.ok(
    mixed.changedFiles.includes("tracked.txt"),
    "Previously staged changes must remain visible."
  );

  assert.ok(
    mixed.changedFiles.includes("unstaged.txt"),
    "Unstaged files must appear in repository evidence."
  );

  assert.match(
    mixed.diff,
    /staged-change/,
    "Staged diff must remain visible with mixed changes."
  );

  assert.doesNotMatch(
    mixed.diff,
    /unstaged-change/,
    "Untracked file contents must not be fabricated as a Git diff."
  );

  assert.match(
    mixed.status,
    /\?\? unstaged\.txt/,
    "Untracked files must remain visible in repository status."
  );

  const evidence = repositoryEvidence(
    before,
    mixed
  );

  assert.match(
    evidence,
    /tracked\.txt/
  );

  assert.match(
    evidence,
    /unstaged\.txt/
  );

  assert.match(
    evidence,
    /staged-change/
  );

  assert.match(
    evidence,
    /UNTRACKED FILES:[\s\S]*unstaged\.txt/
  );

  console.log(
    "PASS: DevMesh repository evidence gate"
  );
} finally {
  await rm(repository, {
    recursive: true,
    force: true
  });
}
