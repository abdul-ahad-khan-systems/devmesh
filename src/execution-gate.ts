import type { ToolCall } from "./tools.js";

export interface ExecutionGateResult {
  allowed: boolean;
  reason: string;
}

const BLOCKED_COMMANDS = [
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
] as const;

function isRepositoryEscape(command: string): boolean {
  return (
    command.startsWith("cd /") ||
    command.startsWith("cd ~") ||
    command.startsWith("cd ../") ||
    command.includes("; cd /") ||
    command.includes("; cd ~") ||
    command.includes("; cd ../") ||
    command.includes("&& cd /") ||
    command.includes("&& cd ~") ||
    command.includes("&& cd ../")
  );
}

export function validateExecution(
  call: ToolCall
): ExecutionGateResult {
  if (call.name !== "run_command") {
    return {
      allowed: true,
      reason: "Tool does not require shell execution policy."
    };
  }

  const command = call.arguments.command;

  if (
    typeof command !== "string" ||
    !command.trim()
  ) {
    return {
      allowed: false,
      reason: "run_command requires a non-empty command."
    };
  }

  const normalized = command.trim().toLowerCase();

  if (normalized === "pwd") {
    return {
      allowed: false,
      reason: "Environment-probing command is blocked."
    };
  }

  if (
    BLOCKED_COMMANDS.some(pattern =>
      normalized.includes(pattern)
    )
  ) {
    return {
      allowed: false,
      reason:
        "Environment-probing, destructive, or privileged command is blocked."
    };
  }

  if (isRepositoryEscape(normalized)) {
    return {
      allowed: false,
      reason: "Repository-escape command is blocked."
    };
  }

  return {
    allowed: true,
    reason: "Execution policy passed."
  };
}
