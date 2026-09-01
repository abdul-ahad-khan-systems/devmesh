import { strict as assert } from "node:assert";
import { validateExecution } from "../src/execution-gate.js";

function check(
  command: string,
  expected: boolean
): void {
  const result = validateExecution({
    id: `test-${command}`,
    name: "run_command",
    arguments: { command }
  });

  assert.equal(
    result.allowed,
    expected,
    `${command}: unexpected execution decision`
  );
}

check("npm test", true);
check("node --experimental-strip-types math.test.mjs", true);
check("git status --short", true);

check("pwd", false);
check("node --version", false);
check("npm --version", false);
check("which node", false);
check("rm -rf something", false);
check("sudo npm test", false);
check("git reset --hard", false);
check("git clean -fd", false);

check("cd /tmp && npm test", false);
check("cd ../outside", false);
check("npm test && cd /tmp", false);

console.log(
  "PASS: DevMesh execution policy gate"
);
