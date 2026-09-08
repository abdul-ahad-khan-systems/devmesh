import "dotenv/config";
import { createInterface } from "node:readline";
import { runMesh } from "./orchestrator.js";
import { classifyCommand } from "./command-router.js";
import { MissionLock } from "./mission-lock.js";
import type { DevTask } from "./types.js";

function parseArgs() {
  const args = process.argv.slice(2);

  let repository: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--repository") {
      repository = args[i + 1];
      i++;
    }
  }

  return { repository };
}

function createTask(
  mission: string,
  repository?: string,
  validationMode: DevTask["validationMode"] = "required"
): DevTask {
  const timestamp = Date.now();

  return {
    id: `devmesh-${timestamp}`,
    title: mission
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120),
    description: mission.trim(),
    repository,
    constraints: [
      "Work only inside the supplied target repository.",
      "Do not modify the DevMesh installation, source, tests, configuration, dependencies, or running process.",
      "Do not commit or push changes without explicit human approval."
    ],
    acceptanceCriteria: [
      "Implement the requested mission completely.",
      "Preserve the stated architecture and invariants.",
      "Add and execute appropriate validation and tests.",
      "Do not claim validation succeeded unless it actually executed successfully."
    ],
    validationMode
  };
}

async function runMission(
  mission: string,
  repository?: string,
  validationMode: DevTask["validationMode"] = "required"
): Promise<void> {
  const task = createTask(
    mission,
    repository,
    validationMode
  );

  try {
    const report = await runMesh(task);

    console.log("\n=== DEVMESH RESULT ===");
    console.log(`Decision: ${report.decision}`);

    console.log("\nArchitecture:");
    console.log(report.architecture.text);

    console.log("\nImplementation:");
    console.log(report.implementation.text);

    for (const [index, review] of report.reviews.entries()) {
      console.log(`\nReview ${index + 1}: ${review.verdict}`);
      console.log(review.result.text);
    }

    console.log("\nValidation:");
    console.log(report.validation.output);

    console.log(
      `\nTrace events: ${report.trace.events.length}`
    );
  } catch (error) {
    console.error(
      "DevMesh failed:",
      error instanceof Error
        ? error.message
        : String(error)
    );
  }
}

const { repository } = parseArgs();

console.log(`
╔══════════════════════════════════════╗
║           DEVMESH v0.1              ║
║     Autonomous Engineering Mesh     ║
╚══════════════════════════════════════╝
`);

console.log(
  'DevMesh ready. Type a mission or "exit".'
);

if (repository) {
  console.log(`[Repository] ${repository}`);
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

let multiline = false;
let missionLines: string[] = [];
let missionValidationMode: DevTask["validationMode"] = "required";
const missionLock = new MissionLock();

function prompt(): void {
  rl.setPrompt(
    multiline
      ? "....> "
      : "devmesh> "
  );

  rl.prompt();
}

rl.on("line", async line => {
  const trimmed = line.trim();

  if (missionLock.isRunning) {
    console.log("Mission already running; input ignored until it completes.");
    return;
  }

  if (!multiline) {
    const command = classifyCommand(line);

    if (command.kind === "EXIT") {
      rl.close();
      return;
    }

    if (command.kind === "MISSION_MODE") {
      multiline = true;
      missionLines = [];
      missionValidationMode = command.mode;

      console.log(
        command.mode === "deferred"
          ? 'Enter construction-batch mission text. Type "/submit" on its own line when finished.'
          : 'Enter mission text. Type "/submit" on its own line when finished.'
      );

      prompt();
      return;
    }

    if (command.kind === "VALIDATE") {
      multiline = true;
      missionLines = [];
      missionValidationMode = "required";
      console.log(
        'Enter validation mission text. Type "/submit" on its own line when finished.'
      );
      prompt();
      return;
    }

    if (command.kind === "BLANK") {
      prompt();
      return;
    }

    if (command.kind === "UNKNOWN_COMMAND") {
      console.log(`Unknown command: ${command.text}`);
      prompt();
      return;
    }

    if (command.kind !== "MISSION") {
      console.log("Invalid CLI state.");
      prompt();
      return;
    }

    if (!missionLock.tryAcquire()) {
      console.log("Mission already running; input ignored until it completes.");
      prompt();
      return;
    }

    rl.pause();

    try {
      await runMission(
        command.text,
        repository,
        missionValidationMode
      );
    } finally {
      missionLock.release();
      rl.resume();
      prompt();
    }

    return;
  }

  if (trimmed === "/submit") {
    const mission = missionLines.join("\n").trim();

    if (!mission) {
      console.log("Mission is empty.");
      prompt();
      return;
    }

    multiline = false;
    missionLines = [];

    const validationMode = missionValidationMode;
    missionValidationMode = "required";

    if (!missionLock.tryAcquire()) {
      console.log("Mission already running; input ignored until it completes.");
      prompt();
      return;
    }

    rl.pause();

    try {
      await runMission(
        mission,
        repository,
        validationMode
      );
    } finally {
      missionLock.release();
      rl.resume();
      prompt();
    }

    return;
  }

  if (trimmed.toLowerCase() === "exit") {
    multiline = false;
    missionLines = [];
    rl.close();
    return;
  }

  missionLines.push(line);
  prompt();
});

rl.on("close", () => {
  console.log();
});
