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
  const [branch, status, diff, names] = await Promise.all([
    git(repository, ["branch", "--show-current"]),
    git(repository, ["status", "--short"]),
    git(repository, ["diff", "--no-ext-diff"]),
    git(repository, ["diff", "--name-only"])
  ]);

  return {
    repository,
    branch: branch.trim(),
    status,
    changedFiles: names
      .split("\n")
      .map(file => file.trim())
      .filter(Boolean),
    diff,
    capturedAt: new Date().toISOString()
  };
}

export function repositoryEvidence(
  before: RepositorySnapshot,
  after: RepositorySnapshot
): string {
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
    after.diff || "(no unstaged diff detected)"
  ].join("\n");
}
