import { strict as assert } from "node:assert";
import { decideMeshOutcome } from "../src/decision.js";

const passReviews = [
  { verdict: "PASS" as const },
  { verdict: "PASS" as const }
];

const failReview = [
  { verdict: "FAIL" as const },
  { verdict: "PASS" as const }
];

assert.equal(
  decideMeshOutcome({
    validation: {
      attempted: true,
      passed: false
    },
    reviews: passReviews,
    evidenceConsistent: true
  }),
  "FAIL",
  "Failed executable validation must override reviewer PASS."
);

assert.equal(
  decideMeshOutcome({
    validation: {
      attempted: true,
      passed: true
    },
    reviews: failReview,
    evidenceConsistent: true
  }),
  "FAIL",
  "A reviewer FAIL must prevent PASS."
);

assert.equal(
  decideMeshOutcome({
    validation: {
      attempted: true,
      passed: true
    },
    reviews: passReviews,
    evidenceConsistent: true
  }),
  "PASS",
  "Passing validation, unanimous PASS, and consistent evidence must permit PASS."
);

assert.equal(
  decideMeshOutcome({
    validation: {
      attempted: true,
      passed: true
    },
    reviews: passReviews,
    evidenceConsistent: false
  }),
  "HUMAN_REVIEW",
  "Inconsistent repository evidence must prevent PASS."
);

assert.equal(
  decideMeshOutcome({
    validation: {
      attempted: false,
      passed: false
    },
    reviews: passReviews,
    evidenceConsistent: true
  }),
  "HUMAN_REVIEW",
  "Unattempted validation must never produce PASS."
);

console.log(
  "PASS: DevMesh decision integrity gate"
);
