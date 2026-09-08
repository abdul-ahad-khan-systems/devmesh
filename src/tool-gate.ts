import type { Role } from "./types.js";
import type { ToolCall, ToolName } from "./tools.js";

const TOOL_NAMES: readonly ToolName[] = [
  "read_file",
  "write_file",
  "list_files",
  "search_files",
  "git_diff",
  "git_status",
  "run_command"
];

const TOOL_ROLES: Record<ToolName, readonly Role[]> = {
  read_file: ["IMPLEMENTER", "REPAIRER"],
  write_file: ["IMPLEMENTER", "REPAIRER"],
  list_files: ["IMPLEMENTER", "REPAIRER"],
  search_files: ["IMPLEMENTER", "REPAIRER"],
  git_diff: ["IMPLEMENTER", "REPAIRER"],
  git_status: ["IMPLEMENTER", "REPAIRER"],
  run_command: ["IMPLEMENTER", "REPAIRER"]
};

export interface ToolGateRequest {
  role: Role;
  repository?: string;
  call: unknown;
}

export interface ToolGateResult {
  allowed: boolean;
  reason: string;
  call?: ToolCall;
}

function isToolName(value: unknown): value is ToolName {
  return (
    typeof value === "string" &&
    (TOOL_NAMES as readonly string[]).includes(value)
  );
}

function isArguments(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function validateToolCall(
  request: ToolGateRequest
): ToolGateResult {
  const raw = request.call;

  if (
    typeof raw !== "object" ||
    raw === null
  ) {
    return {
      allowed: false,
      reason: "Malformed tool call."
    };
  }

  const candidate = raw as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    !candidate.id.trim()
  ) {
    return {
      allowed: false,
      reason: "Tool call is missing a valid id."
    };
  }

  if (!isToolName(candidate.name)) {
    return {
      allowed: false,
      reason:
        `Unknown or unsupported tool: ${String(candidate.name)}.`
    };
  }

  if (
    !TOOL_ROLES[candidate.name].includes(request.role)
  ) {
    return {
      allowed: false,
      reason:
        `Role ${request.role} is not authorized to use tool ` +
        `${candidate.name}.`
    };
  }

  if (!request.repository?.trim()) {
    return {
      allowed: false,
      reason:
        "Repository-bound tool call requires a target repository."
    };
  }

  if (!isArguments(candidate.arguments)) {
    return {
      allowed: false,
      reason:
        `Tool ${candidate.name} requires an object argument payload.`
    };
  }

  return {
    allowed: true,
    reason: "Tool call passed integrity checks.",
    call: {
      id: candidate.id,
      name: candidate.name,
      arguments: candidate.arguments
    }
  };
}
