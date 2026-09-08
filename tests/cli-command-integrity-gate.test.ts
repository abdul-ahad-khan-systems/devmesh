import assert from "node:assert/strict";
import { classifyCommand } from "../src/command-router.js";

const unknownCommands = [
  "/construct",
  "/co",
  "/foo",
  "/unknown",
  "/mission-extra",
  "/construction-extra",
  "/validate-extra"
];

for (const input of unknownCommands) {
  const result = classifyCommand(input);

  assert.equal(
    result.kind,
    "UNKNOWN_COMMAND",
    `${input} must be rejected as an unknown command.`
  );

  if (result.kind === "UNKNOWN_COMMAND") {
    assert.equal(
      result.text,
      input,
      `${input} rejection must preserve the submitted command.`
    );
  }
}

assert.deepEqual(
  classifyCommand("/mission"),
  { kind: "MISSION_MODE", mode: "required" },
  "/mission must enter required-validation mission mode."
);

assert.deepEqual(
  classifyCommand("/construction"),
  { kind: "MISSION_MODE", mode: "deferred" },
  "/construction must enter deferred-validation construction mode."
);

assert.deepEqual(
  classifyCommand("/validate"),
  { kind: "VALIDATE" },
  "/validate must enter validation mode."
);

assert.deepEqual(
  classifyCommand("/submit"),
  { kind: "SUBMIT" },
  "/submit must remain a dedicated submit command."
);

assert.deepEqual(
  classifyCommand("exit"),
  { kind: "EXIT" },
  "exit must remain an exit command."
);

assert.deepEqual(
  classifyCommand(""),
  { kind: "BLANK" },
  "Blank input must not become a mission."
);

assert.deepEqual(
  classifyCommand("Build the Standard Connector"),
  {
    kind: "MISSION",
    text: "Build the Standard Connector"
  },
  "Ordinary mission text must remain executable."
);

console.log("PASS: DevMesh CLI command integrity gate");
