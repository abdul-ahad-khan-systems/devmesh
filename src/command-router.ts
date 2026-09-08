export type CliCommand =
  | { kind: "MISSION"; text: string }
  | { kind: "MISSION_MODE"; mode: "required" | "deferred" }
  | { kind: "VALIDATE" }
  | { kind: "SUBMIT" }
  | { kind: "EXIT" }
  | { kind: "BLANK" }
  | { kind: "UNKNOWN_COMMAND"; text: string };

export function classifyCommand(input: string): CliCommand {
  const trimmed = input.trim();

  if (!trimmed) {
    return { kind: "BLANK" };
  }

  if (trimmed.toLowerCase() === "exit") {
    return { kind: "EXIT" };
  }

  if (trimmed === "/mission") {
    return { kind: "MISSION_MODE", mode: "required" };
  }

  if (trimmed === "/construction") {
    return { kind: "MISSION_MODE", mode: "deferred" };
  }

  if (trimmed === "/validate") {
    return { kind: "VALIDATE" };
  }

  if (trimmed === "/submit") {
    return { kind: "SUBMIT" };
  }

  if (trimmed.startsWith("/")) {
    return { kind: "UNKNOWN_COMMAND", text: trimmed };
  }

  return { kind: "MISSION", text: input };
}
