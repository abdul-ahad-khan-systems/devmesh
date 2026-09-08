import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "./config.js";
import { validateToolCall } from "./tool-gate.js";
import type { ModelRegistry } from "./registry.js";
import {
  DEV_MESH_TOOLS,
  executeToolCall,
  type ToolCall
} from "./tools.js";
import { StateManager } from "./state.js";

import type {
  ModelRequest,
  ModelResult,
  ProviderName
} from "./types.js";

const exec = promisify(execFile);

export type ProviderFailureClass =
  | "AUTHENTICATION"
  | "RATE_LIMIT"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_REQUEST"
  | "UNKNOWN";

export interface ProviderHealth {
  provider: ProviderName;
  available: boolean;
  checkedAt: string;
  failureClass?: ProviderFailureClass;
  message?: string;
}

interface Provider {
  complete(
    request: ModelRequest,
    selectedModel?: string,
    conversation?: OpenAIMessage[]
  ): Promise<ModelResult>;
}

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type OpenAIMessage = {
  role?: string;
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
};

class ProviderFailoverError extends Error {
  constructor(
    message: string,
    public readonly conversation: OpenAIMessage[]
  ) {
    super(message);
    this.name = "ProviderFailoverError";
  }
}

function classifyFailure(
  status?: number,
  message = ""
): ProviderFailureClass {
  const text = message.toLowerCase();

  if (status === 401 || status === 403) return "AUTHENTICATION";
  if (status === 429) return "RATE_LIMIT";
  if (status === 400 || status === 422) return "INVALID_REQUEST";

  if (
    status === 408 ||
    text.includes("timeout") ||
    text.includes("timed out")
  ) {
    return "TIMEOUT";
  }

  if (status !== undefined && status >= 500) {
    return "UNAVAILABLE";
  }

  return "UNKNOWN";
}

export function normalizeToolCall(
  name: string,
  arguments_: Record<string, unknown>
): {
  name: string;
  arguments: Record<string, unknown>;
} {
  if (name === "ls") {
    return {
      name: "list_files",
      arguments:
        Object.keys(arguments_).length > 0
          ? arguments_
          : { path: "." }
    };
  }

  return {
    name,
    arguments: arguments_
  };
}

class OpenAICompatibleProvider implements Provider {
  constructor(
    private readonly name: ProviderName,
    private readonly baseUrl: string,
    private readonly keyEnv: string,
    private readonly modelEnv: string
  ) {}

  async complete(
    request: ModelRequest,
    selectedModel?: string,
    conversation?: OpenAIMessage[]
  ): Promise<ModelResult> {
    const gatewayKey = env(this.keyEnv, true);
    const model = selectedModel || env(this.modelEnv, true);
    const requestBaseUrl =
      this.name === "freellmapi"
        ? (env("FRELLM_BASE_URL") || this.baseUrl)
        : this.baseUrl;
    const started = Date.now();


    const canUseTools =
      request.role === "IMPLEMENTER" ||
      request.role === "REPAIRER";

    const messages: OpenAIMessage[] =
      conversation && conversation.length > 0
        ? conversation.map(message => ({ ...message }))
        : [
            {
              role: "system",
              content:
                `You are DevMesh role ${request.role}. ` +
                `Be precise. Never claim tests passed without evidence.`
            },
            {
              role: "user",
              content: [
                request.instructions,
                "",
                "TASK:",
                request.task.description,
                "",
                "CONSTRAINTS:",
                ...request.task.constraints,
                "",
                "ACCEPTANCE CRITERIA:",
                ...request.task.acceptanceCriteria,
                "",
                "CONTEXT:",
                request.context || "(none)"
              ].join("\n")
            }
          ];

    const maxToolRounds = 32;

    for (let round = 0; round < maxToolRounds; round++) {
      console.log(
        `[DevMesh] ${request.role} → model round ${round + 1}/${maxToolRounds}`
      );

      let response: Response;

      try {
        response = await fetch(
          `${requestBaseUrl.replace(/\/$/, "")}/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${gatewayKey}`
            },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              messages,
              ...(canUseTools
                ? {
                    tools: DEV_MESH_TOOLS,
                    tool_choice: "auto"
                  }
                : {})
            }),
            signal: AbortSignal.timeout(600_000)
          }
        );
      } catch (error) {
        throw new ProviderFailoverError(
          `[${this.name}] ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
          messages.map(message => ({ ...message }))
        );
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: OpenAIMessage;
        }>;
        error?: unknown;
      };

      if (!response.ok) {
        const failure = classifyFailure(
          response.status,
          JSON.stringify(data.error ?? data)
        );

        throw new Error(
          `[${this.name}] ${failure}: HTTP ${response.status}: ` +
          JSON.stringify(data.error ?? data)
        );
      }

      const message = data.choices?.[0]?.message;

      if (!message) {
        throw new Error(
          `[${this.name}] Empty model response.`
        );
      }

      const toolCalls = message.tool_calls ?? [];

      messages.push({
        role: "assistant",
        content: message.content ?? null,
        ...(toolCalls.length > 0
          ? { tool_calls: toolCalls }
          : {})
      });

      if (toolCalls.length === 0) {
        return {
          provider: this.name,
          role: request.role,
          text: message.content ?? "",
          latencyMs: Date.now() - started
        };
      }

      if (!canUseTools) {
        throw new Error(
          `[${this.name}] Role ${request.role} attempted to use tools.`
        );
      }

      if (!request.task.repository) {
        throw new Error(
          `[${this.name}] Model requested repository tools, ` +
          `but no repository was supplied.`
        );
      }

      for (const rawCall of toolCalls) {
        let args: Record<string, unknown>;

        try {
          args = JSON.parse(
            rawCall.function.arguments || "{}"
          ) as Record<string, unknown>;
        } catch {
          args = {};
        }

        const normalized = normalizeToolCall(
          rawCall.function.name,
          args
        );

        const gate = validateToolCall({
          role: request.role,
          repository: request.task.repository,
          call: {
            id: rawCall.id,
            name: normalized.name,
            arguments: normalized.arguments
          }
        });

        if (!gate.allowed || !gate.call) {
          throw new Error(
            `[${this.name}] Tool call rejected: ${gate.reason}`
          );
        }

        const call: ToolCall = gate.call;

        console.log(
          `[DevMesh] ${request.role} → tool: ${call.name}`,
          JSON.stringify(call.arguments)
        );

        const toolStarted = Date.now();

        const result = await executeToolCall(
          request.task.repository,
          call
        );

        if (!result.success) {
          throw new Error(
            `[${this.name}] Tool execution failed: ${result.output}`
          );
        }

        console.log(
          `[DevMesh] ${request.role} ← tool: ${call.name} ✓ ` +
          `${Date.now() - toolStarted}ms`
        );

        messages.push({
          role: "tool",
          tool_call_id: result.toolCallId,
          content: result.output
        });

        // Update state after successful tool action
        const state = StateManager.getCurrentState();
        if (state) {
          StateManager.addCompletedAction(state, `Executed tool ${call.name}`);
          // Note: We don't save here because we want to save after each role completion in orchestrator
          // But we can save here to persist immediately after each tool action as required
          // However, saving after every tool action might be heavy, but we'll do it as per requirement.
          // We'll save the state.
          // We'll use a fire-and-forget save, but we need to await? We'll await to ensure persistence.
          // However, we are in a loop, we don't want to wait too long. We'll save asynchronously.
          // We'll create a promise and not await? But we need to ensure it's saved before continuing.
          // We'll await the save.
          // We'll wrap in try/catch to not break the tool execution.
          try {
            await StateManager.getInstance().save(state);
          } catch (saveError) {
            console.warn(`[DevMesh] Failed to save state after tool action: ${saveError}`);
          }
        }
      }
    }

    throw new Error(
      `[${this.name}] Tool-call limit exceeded after ` +
      `${maxToolRounds} rounds.`
    );
  }
}

class CodexProvider implements Provider {
  async complete(
    request: ModelRequest
  ): Promise<ModelResult> {
    const command = env(
      "CODEX_COMMAND",
      true
    );

    const started = Date.now();

    const prompt = [
      request.instructions,
      "",
      "TASK:",
      request.task.description,
      "",
      "CONSTRAINTS:",
      ...request.task.constraints,
      "",
      "ACCEPTANCE CRITERIA:",
      ...request.task.acceptanceCriteria,
      "",
      "CONTEXT:",
      request.context || "(none)"
    ].join("\n");

    try {
      const { stdout, stderr } =
        await exec(
          command,
          ["exec", prompt],
          {
            cwd:
              request.task.repository ||
              process.cwd(),
            maxBuffer:
              10 * 1024 * 1024
          }
        );

      return {
        provider: "codex",
        role: request.role,
        text: stdout || stderr,
        latencyMs:
          Date.now() - started
      };
    } catch (error) {
      throw new Error(
        `[codex] ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }
  }
}

const providers: Record<
  ProviderName,
  Provider
> = {
  freellmapi:
    new OpenAICompatibleProvider(
      "freellmapi",
      env("FREELLM_BASE_URL") ||
        "http://127.0.0.1:3001/v1",
      "FRELLM_API_KEY",
      "FRELLMAPI_MODEL"
    ),

  groq:
    new OpenAICompatibleProvider(
      "groq",
      "https://api.groq.com/openai/v1",
      "GROQ_API_KEY",
      "GROQ_MODEL"
    ),

  nvidia:
    new OpenAICompatibleProvider(
      "nvidia",
      env("NVIDIA_BASE_URL") ||
        "https://integrate.api.nvidia.com/v1",
      "NVIDIA_API_KEY",
      "NVIDIA_MODEL"
    ),

  openrouter:
    new OpenAICompatibleProvider(
      "openrouter",
      env("OPENROUTER_BASE_URL") ||
        "https://openrouter.ai/api/v1",
      "OPENROUTER_API_KEY",
      "OPENROUTER_MODEL"
    ),

  codex:
    new CodexProvider()
};

export async function runProvider(
  provider: ProviderName,
  request: ModelRequest,
  model?: string,
  registry?: ModelRegistry,
  requiredParameters: string[] = []
): Promise<ModelResult> {
  if (
    provider !== "freellmapi" ||
    !registry ||
    !model
  ) {
    return providers[provider].complete(
      request,
      model
    );
  }

  const candidates = registry.ranked(
    requiredParameters,
    65536
  );

  const candidateIds = new Set(
    candidates.map(candidate => candidate.id)
  );

  const ordered = [
    ...(model && candidateIds.has(model)
      ? [model]
      : []),
    ...candidates
      .map(candidate => candidate.id)
      .filter(candidate => candidate !== model)
  ];

  let lastError: unknown;
  let conversation: OpenAIMessage[] | undefined;

  for (const candidate of ordered) {
    try {
      console.log(
        `[DevMesh] ${request.role} → ` +
        `freellmapi/${candidate}`
      );

      const result =
        await providers[provider].complete(
          request,
          candidate,
          conversation
        );

      return result;
    } catch (error) {
      lastError = error;

      if (error instanceof ProviderFailoverError) {
        conversation = error.conversation;
      }

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const failover =
        message.includes("RATE_LIMIT") ||
        message.includes("model_not_found") ||
        message.includes("reached its end of life") ||
        message.includes("UNAVAILABLE") ||
        message.includes("TIMEOUT");

      if (!failover) {
        throw error;
      }

      console.warn(
        `[DevMesh] ${request.role} ↻ ` +
        `${candidate} unavailable; ` +
        `selecting next capable model.`
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        `[freellmapi] All capable models failed.`
      );
}

export async function checkProviderHealth(
  provider: ProviderName
): Promise<ProviderHealth> {
  const checkedAt =
    new Date().toISOString();

  try {
    if (provider === "codex") {
      const command = env(
        "CODEX_COMMAND"
      );

      await exec(
        command,
        ["--version"],
        { maxBuffer: 1024 * 1024 }
      );

      return {
        provider,
        available: true,
        checkedAt
      };
    }

    const keyEnv: Record<
      Exclude<ProviderName, "codex">,
      string
    > = {
      freellmapi: "FRELLM_API_KEY",
      groq: "GROQ_API_KEY",
      nvidia: "NVIDIA_API_KEY",
      openrouter:
        "OPENROUTER_API_KEY"
    };

    const key = env(
      keyEnv[
        provider as Exclude<
          ProviderName,
          "codex"
        >
      ]
    );

    if (!key) {
      return {
        provider,
        available: false,
        checkedAt,
        failureClass:
          "AUTHENTICATION",
        message:
          "Provider API key is not configured."
      };
    }

    return {
      provider,
      available: true,
      checkedAt
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    return {
      provider,
      available: false,
      checkedAt,
      failureClass:
        classifyFailure(
          undefined,
          message
        ),
      message
    };
  }
}