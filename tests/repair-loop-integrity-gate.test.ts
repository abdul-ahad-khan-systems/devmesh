import { strict as assert } from "node:assert";
import { decideMeshOutcome } from "../src/decision.js";

function freshValidation(
  attempted: boolean,
  passed: boolean
) {
  return {
    attempted,
    passed,
    command: "npm run check",
    output: passed ? "PASS" : "FAIL"
  };
}

const passReviews = [
  { verdict: "PASS" as const },
  { verdict: "PASS" as const }
];

const failReviews = [
  { verdict: "FAIL" as const },
  { verdict: "PASS" as const }
];

// A repair attempt by itself can never establish PASS.
assert.equal(
  decideMeshOutcome({
    validation: freshValidation(false, false),
    reviews: passReviews,
    evidenceConsistent: true
  }),
  "HUMAN_REVIEW",
  "Repair activity without fresh validation must not produce PASS."
);

// A failed fresh validation must remain FAIL when executable validation
// was actually attempted.
assert.equal(
  decideMeshOutcome({
    validation: freshValidation(true, false),
    reviews: passReviews,
    evidenceConsistent: true
  }),
  "FAIL",
  "A failed post-repair validation must prevent PASS."
);

// A fresh successful validation is necessary but reviewer failure still
// prevents PASS.
assert.equal(
  decideMeshOutcome({
    validation: freshValidation(true, true),
    reviews: failReviews,
    evidenceConsistent: true
  }),
  "FAIL",
  "Successful repair validation cannot override reviewer FAIL."
);

// Only fresh successful validation + unanimous review + consistent evidence
// can produce PASS.
assert.equal(
  decideMeshOutcome({
    validation: freshValidation(true, true),
    reviews: passReviews,
    evidenceConsistent: true
  }),
  "PASS",
  "A repaired implementation may PASS only after fresh validation and review."
);

// A fresh validation result with inconsistent repository evidence must still
// stop automatic PASS.
assert.equal(
  decideMeshOutcome({
    validation: freshValidation(true, true),
    reviews: passReviews,
    evidenceConsistent: false
  }),
  "HUMAN_REVIEW",
  "Repair validation cannot override inconsistent repository evidence."
);

console.log(
  "PASS: DevMesh repair-loop integrity gate"
);
