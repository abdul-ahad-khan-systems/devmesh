import readline from "node:readline";
import { appendFileSync } from "node:fs";
import { executeStandardConnectorTool } from "./standard-connector.js";
import type { Role } from "../types.js";

const LOG_FILE = "/tmp/track-b-live.log";

function log(message: string): void {
  appendFileSync(
    LOG_FILE,
    `[${new Date().toISOString()}] ${message}\n`
  );
}

appendFileSync(
  LOG_FILE,
  `\n=== DEV MESH SESSION ${new Date().toISOString()} ===\n`
);

log("Bridge started");
log(`Repository: ${process.cwd()}`);

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", async (line) => {
  let requestId: string | undefined;

  try {
    const request = JSON.parse(line);

    if (
      !request ||
      typeof request.id !== "string" ||
      typeof request.name !== "string"
    ) {
      throw new Error("Invalid request: id and name must be strings");
    }

    requestId = request.id;

    log(`REQUEST RECEIVED: ${requestId}`);
    log(`ROLE: ${request.role}`);
    log(`TOOL: ${request.name}`);
    log(`ARGUMENTS: ${JSON.stringify(request.arguments ?? {})}`);
    log("ToolGate: checking authorization");

    const response = await executeStandardConnectorTool(
      process.cwd(),
      request.role as Role,
      {
        id: request.id as string,
        name: request.name,
        arguments: request.arguments ?? {},
      }
    );

    log(`ToolGate: ${response.gate.allowed ? "ALLOWED" : "DENIED"}`);
    log(`ToolGate reason: ${response.gate.reason}`);
    log(`EXECUTION: ${response.result.success ? "SUCCESS" : "FAILED"}`);

    if (response.result.success) {
      log("RESULT: Tool execution completed");
    } else {
      log(`RESULT ERROR: ${response.result.output}`);
    }

    process.stdout.write(
      JSON.stringify({ requestId, ...response }) + "\n"
    );
  } catch (error) {
    const message = String(error);
    const id = requestId ?? null;

    log(`BRIDGE ERROR [${id ?? "unknown"}]: ${message}`);

    process.stdout.write(
      JSON.stringify({
        requestId: id,
        gate: { allowed: false, reason: message },
        result: {
          toolCallId: id ?? "bridge-error",
          name: "unknown",
          output: message,
          success: false,
        },
      }) + "\n"
    );
  }
});
