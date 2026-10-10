import { validateToolCall } from "../tool-gate.js";
import {
  executeToolCall,
  type ToolCall,
  type ToolResult
} from "../tools.js";
import { normalizeToolCall } from "../providers.js";
import type { Role } from "../types.js";

export interface StandardConnectorToolRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface StandardConnectorToolResult {
  result: ToolResult;
  gate: {
    allowed: boolean;
    reason: string;
  };
}

export async function executeStandardConnectorTool(
  repository: string,
  role: Role,
  request: StandardConnectorToolRequest
): Promise<StandardConnectorToolResult> {
  const normalized = normalizeToolCall(
    request.name,
    request.arguments
  );

  const gate = validateToolCall({
    role,
    repository,
    call: {
      id: request.id,
      name: normalized.name,
      arguments: normalized.arguments
    }
  });

  if (!gate.allowed || !gate.call) {
    return {
      gate: {
        allowed: false,
        reason: gate.reason
      },
      result: {
        toolCallId: request.id,
        name: normalized.name as ToolCall["name"],
        output: gate.reason,
        success: false
      }
    };
  }

  const result = await executeToolCall(
    repository,
    gate.call
  );

  return {
    gate: {
      allowed: true,
      reason: gate.reason
    },
    result
  };
}
