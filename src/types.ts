export type Role =
  | "ARCHITECT"
  | "IMPLEMENTER"
  | "REVIEWER"
  | "ALTERNATIVE_REVIEWER"
  | "VALIDATOR"
  | "REPAIRER";

export type ProviderName =
  | "freellmapi"
  | "groq"
  | "nvidia"
  | "openrouter"
  | "codex";

export type MeshDecision =
  | "PASS"
  | "FAIL"
  | "HUMAN_REVIEW";

export type MeshEventType =
  | "TASK_RECEIVED"
  | "ROLE_STARTED"
  | "ROLE_COMPLETED"
  | "ROLE_FAILED"
  | "REVIEW_STARTED"
  | "REVIEW_COMPLETED"
  | "VALIDATION_STARTED"
  | "VALIDATION_COMPLETED"
  | "DECISION_MADE";

export interface DevTask {
  id: string;
  title: string;
  description: string;
  repository?: string;
  constraints: string[];
  acceptanceCriteria: string[];
}

export interface ModelRequest {
  role: Role;
  task: DevTask;
  context: string;
  instructions: string;
}

export interface ModelResult {
  provider: ProviderName;
  role: Role;
  text: string;
  latencyMs: number;
}

export interface ReviewResult {
  result: ModelResult;
  verdict: "PASS" | "FAIL" | "CONDITIONAL";
  findings: string[];
}

export interface ValidationResult {
  attempted: boolean;
  passed: boolean;
  command?: string;
  output: string;
}

export interface MeshEvent {
  eventId: string;
  traceId: string;
  taskId: string;
  timestamp: string;
  type: MeshEventType;
  role?: Role;
  provider?: ProviderName;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface MeshTrace {
  traceId: string;
  events: MeshEvent[];
}

export interface MeshReport {
  task: DevTask;
  trace: MeshTrace;
  architecture: ModelResult;
  implementation: ModelResult;
  reviews: ReviewResult[];
  validation: ValidationResult;
  decision: MeshDecision;
}
