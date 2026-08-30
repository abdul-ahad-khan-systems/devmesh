import type {
  MeshDecision,
  ReviewResult,
  ValidationResult
} from "./types.js";

export interface DecisionInputs {
  validation: Pick<
    ValidationResult,
    "attempted" | "passed"
  >;

  reviews: Array<
    Pick<ReviewResult, "verdict">
  >;

  evidenceConsistent: boolean;
}

export function decideMeshOutcome(
  input: DecisionInputs
): MeshDecision {
  const conflict =
    new Set(
      input.reviews.map(review => review.verdict)
    ).size > 1;

  const allReviewsPass =
    input.reviews.length > 0 &&
    input.reviews.every(
      review => review.verdict === "PASS"
    );

  if (
    input.validation.attempted &&
    input.validation.passed &&
    !conflict &&
    allReviewsPass &&
    input.evidenceConsistent
  ) {
    return "PASS";
  }

  if (
    input.reviews.some(
      review => review.verdict === "FAIL"
    ) ||
    (
      input.validation.attempted &&
      !input.validation.passed
    )
  ) {
    return "FAIL";
  }

  return "HUMAN_REVIEW";
}
