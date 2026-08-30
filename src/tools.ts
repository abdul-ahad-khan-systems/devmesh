import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, relative, resolve } from "node:path";
import { readFile, writeFile, readdir } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export type ToolName =
  | "read_file"
  | "write_file"
  | "list_files"
  | "search_files"
  | "git_diff"
  | "git_status"
  | "run_command";

export interface ToolCall {
  id: string;
  name: ToolName;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: ToolName;
  output: string;
  success: boolean;
}

function safePath(repository: string, requested: string): string {
  if (isAbsolute(requested)) {
    throw new Error("Absolute paths are not allowed.");
  }

  const root = resolve(repository);
  const target = resolve(root, requested);
  const rel = relative(root, target);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Path escapes the target repository.");
  }

  return target;
}

function stringArg(
  args: Record<string, unknown>,
  name: string
): string {
  const value = args[name];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing string argument: ${name}`);
  }

  return value;
}

async function executeTool(
  repository: string,
  call: ToolCall
): Promise<string> {
  switch (call.name) {
    case "read_file": {
      const path = safePath(
        repository,
        stringArg(call.arguments, "path")
      );

      return await readFile(path, "utf8");
    }

    case "write_file": {
      const path = safePath(
        repository,
        stringArg(call.arguments, "path")
      );

      const content = stringArg(
        call.arguments,
        "content"
      );

      await writeFile(path, content, "utf8");

      return `Wrote ${call.arguments.path}.`;
    }

    case "list_files": {
      const requested =
        typeof call.arguments.path === "string"
          ? call.arguments.path
          : ".";

      const path = safePath(repository, requested);
      const entries = await readdir(path, {
        withFileTypes: true
      });

      return entries
        .map(entry =>
          `${entry.isDirectory() ? "DIR " : "FILE"} ${entry.name}`
        )
        .join("\n");
    }

    case "search_files": {
      const query = stringArg(
        call.arguments,
        "query"
      );

      const result = await execFileAsync(
        "grep",
        [
          "-R",
          "-n",
          "--exclude-dir=.git",
          "--exclude-dir=node_modules",
          query,
          "."
        ],
        {
          cwd: repository,
          maxBuffer: 10 * 1024 * 1024
        }
      );

      return result.stdout || "(no matches)";
    }

    case "git_diff": {
      const result = await execFileAsync(
        "git",
        ["diff", "--no-ext-diff"],
        {
          cwd: repository,
          maxBuffer: 20 * 1024 * 1024
        }
      );

      return result.stdout || "(no unstaged diff)";
    }

    case "git_status": {
      const result = await execFileAsync(
        "git",
        ["status", "--short"],
        {
          cwd: repository,
          maxBuffer: 5 * 1024 * 1024
        }
      );

      return result.stdout || "(clean)";
    }

    case "run_command": {
      const command = stringArg(
        call.arguments,
        "command"
      );

      const normalizedCommand =
        command.trim().toLowerCase();

      const blockedPatterns = [
        "rm -rf",
        "git reset --hard",
        "git clean -fd",
        "sudo ",
        "which ",
        "whereis ",
        "command -v ",
        "node --version",
        "npm --version",
        "npx --version",
        "tsc --version",
        "deno --version",
        "bun --version",
        "python --version",
        "python3 --version",
        "curl --version",
        "git --version"
      ];

      const trimmedCommand = normalizedCommand.trim();

      const attemptsRepositoryEscape =
        trimmedCommand.startsWith("cd /") ||
        trimmedCommand.startsWith("cd ~") ||
        trimmedCommand.startsWith("cd ../") ||
        trimmedCommand.includes("; cd /") ||
        trimmedCommand.includes("; cd ~") ||
        trimmedCommand.includes("; cd ../") ||
        trimmedCommand.includes("&& cd /") ||
        trimmedCommand.includes("&& cd ~") ||
        trimmedCommand.includes("&& cd ../");

      if (
        blockedPatterns.some(pattern =>
          normalizedCommand.includes(pattern)
        ) ||
        trimmedCommand === "pwd" ||
        attemptsRepositoryEscape
      ) {
        throw new Error(
          "Environment-probing, repository-escape, " +
          "destructive, or privileged commands are blocked."
        );
      }

      const result = await execFileAsync(
        "sh",
        ["-lc", command],
        {
          cwd: repository,
          maxBuffer: 20 * 1024 * 1024
        }
      );

      return (
        result.stdout +
        result.stderr
      ).trim() || "(command completed with no output)";
    }
  }
}

export async function executeToolCall(
  repository: string,
  call: ToolCall
): Promise<ToolResult> {
  try {
    const output = await executeTool(
      repository,
      call
    );

    return {
      toolCallId: call.id,
      name: call.name,
      output,
      success: true
    };
  } catch (error) {
    return {
      toolCallId: call.id,
      name: call.name,
      output:
        error instanceof Error
          ? error.message
          : String(error),
      success: false
    };
  }
}

export const DEV_MESH_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a UTF-8 file inside the target repository.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write or replace a UTF-8 file inside the target repository.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string"
          },
          content: {
            type: "string"
          }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description:
        "List files and directories inside the target repository.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description:
        "Search repository text while excluding .git and node_modules.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description:
        "Inspect the current unstaged git diff.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description:
        "Inspect git status.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a non-destructive shell command inside the target repository.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string"
          }
        },
        required: ["command"]
      }
    }
  }
] as const;
