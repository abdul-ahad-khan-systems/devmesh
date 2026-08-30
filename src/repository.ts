import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RepositorySnapshot {
  repository: string;
  branch: string;
  status: string;
  changedFiles: string[];
  diff: string;
  capturedAt: string;
}

async function git(
  repository: string,
  args: string[]
): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repository, ...args],
    {
      maxBuffer: 20 * 1024 * 1024
    }
  );

  return stdout;
}

export async function captureRepository(
  repository: string
): Promise<RepositorySnapshot> {
  const [
    branch,
    status,
    unstagedDiff,
    stagedDiff,
    unstagedNames,
    stagedNames
  ] = await Promise.all([
    git(repository, ["branch", "--show-current"]),
    git(repository, ["status", "--short"]),
    git(repository, ["diff", "--no-ext-diff"]),
    git(repository, ["diff", "--cached", "--no-ext-diff"]),
    git(repository, ["diff", "--name-only"]),
    git(repository, ["diff", "--cached", "--name-only"])
  ]);

  const untrackedNames = status
    .split("\n")
    .filter(line => line.startsWith("?? "))
    .map(line => line.slice(3).trim())
    .filter(Boolean);

  const changedFiles = [
    ...stagedNames.split("\n"),
    ...unstagedNames.split("\n"),
    ...untrackedNames
  ]
    .map(file => file.trim())
    .filter(Boolean)
    .filter(
      (file, index, files) =>
        files.indexOf(file) === index
    );

  const diff = [
    stagedDiff.trim(),
    unstagedDiff.trim()
  ]
    .filter(Boolean)
    .join("\n");

  return {
    repository,
    branch: branch.trim(),
    status,
    changedFiles,
    diff,
    capturedAt: new Date().toISOString()
  };
}

export function repositoryEvidence(
  before: RepositorySnapshot,
  after: RepositorySnapshot
): string {
  const untrackedFiles = after.status
    .split("\n")
    .filter(line => line.startsWith("?? "))
    .map(line => line.slice(3).trim())
    .filter(Boolean);

  return [
    "REPOSITORY EVIDENCE",
    "",
    `Repository: ${after.repository}`,
    `Branch: ${after.branch}`,
    "",
    "STATUS BEFORE:",
    before.status || "(clean)",
    "",
    "STATUS AFTER:",
    after.status || "(clean)",
    "",
    "CHANGED FILES:",
    after.changedFiles.length
      ? after.changedFiles.join("\n")
      : "(none detected)",
    "",
    "DIFF AFTER:",
    after.diff ||
      "(no staged or unstaged tracked diff detected)",
    "",
    "UNTRACKED FILES:",
    untrackedFiles.length
      ? untrackedFiles.join("\n")
      : "(none)"
  ].join("\n");
}
