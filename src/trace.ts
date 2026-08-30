import type { Role, ProviderName } from "./types.js";

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

export class MeshTrace {
  readonly traceId: string;
  private readonly events: MeshEvent[] = [];

  constructor(taskId: string) {
    this.traceId = `dmtrace_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    this.emit(taskId, "TASK_RECEIVED", "DevMesh trace initialized.");
  }

  emit(
    taskId: string,
    type: MeshEventType,
    summary: string,
    options: {
      role?: Role;
      provider?: ProviderName;
      metadata?: Record<string, unknown>;
    } = {}
  ): MeshEvent {
    const event: MeshEvent = {
      eventId: `${this.traceId}:${this.events.length + 1}`,
      traceId: this.traceId,
      taskId,
      timestamp: new Date().toISOString(),
      type,
      summary,
      ...options
    };

    this.events.push(event);
    return event;
  }

  getEvents(): readonly MeshEvent[] {
    return [...this.events];
  }

  export(): MeshEvent[] {
    return [...this.events];
  }
}
