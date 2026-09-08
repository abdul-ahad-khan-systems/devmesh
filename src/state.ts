import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { DevTask, Role, ProviderName, ValidationResult } from "./types.js";

export interface ConstructionState {
  missionId: string; // DevTask ID (for trace)
  stateId: string; // deterministic ID for persistence
  repository: string | undefined;
  validationMode: DevTask["validationMode"];
  phase: string; // e.g., "ARCHITECT", "IMPLEMENTER", "REVIEW", "VALIDATION", "REPAIRER", "DECISION"
  objective: string; // current objective (task description)
  role: Role; // current role
  provider: ProviderName;
  model: string;
  modelRound: number;
  lastSuccessfulAction: string | undefined;
  nextRequiredAction: string;
  completedActions: string[];
  completedArtifacts: {
    [filePath: string]: {
      content: string;
      fingerprint: string
    }
  };
  verifiedArtifacts: {
    [filePath: string]: {
      content: string;
      fingerprint: string
    }
  };
  relevantEvidence: string; // general evidence from context
  repositoryEvidence: string; // evidence from repository snapshots
  failures: Array<{
    timestamp: string;
    role: Role;
    provider: ProviderName;
    error: string;
  }>;
  checkpointTimestamp: string;
  ledger: { [objective: string]: "DONE" | "IN_PROGRESS" | "NOT_STARTED" };
  // Intermediate results to avoid recomputation
  architectureText: string;
  implementationText: string;
  reviewTexts: string[]; // [primaryReviewText, alternativeReviewText]
  validationOutput: string;
  validationAttempted: boolean;
  validationPassed: boolean;
  // Repair attempts
  repairAttempts: number;
}

export class StateManager {
  private static instance: StateManager;
  private static currentState: ConstructionState | undefined;
  private stateDir: string;
  private inMemoryStates: Map<string, ConstructionState>;

  private constructor() {
    // Allow overriding state directory for testing
    const envDir = process.env.DEVMESH_STATE_DIR;
    if (envDir) {
      this.stateDir = envDir;
    } else {
      this.stateDir = join(process.cwd(), ".devmesh", "states");
    }
    this.inMemoryStates = new Map();
  }

  public static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  public static setCurrentState(state: ConstructionState): void {
    StateManager.currentState = state;
  }

  public static getCurrentState(): ConstructionState | undefined {
    return StateManager.currentState;
  }

  private async ensureStateDir(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true });
  }

  private getStateFilePath(stateId: string): string {
    return join(this.stateDir, `${stateId}.json`);
  }

  private computeStateId(task: DevTask): string {
    const hash = createHash('sha256');
    hash.update(task.description);
    hash.update(task.repository || '');
    return hash.digest('hex');
  }

  public async load(task: DevTask): Promise<ConstructionState | undefined> {
    const stateId = this.computeStateId(task);
    // Check in-memory cache first
    if (this.inMemoryStates.has(stateId)) {
      return this.inMemoryStates.get(stateId);
    }

    const stateFile = this.getStateFilePath(stateId);
    try {
      await stat(stateFile);
      const data = await readFile(stateFile, "utf8");
      const state = JSON.parse(data) as ConstructionState;
      // Update the missionId from the current task (in case it changed? but should be same)
      state.missionId = task.id;
      this.inMemoryStates.set(stateId, state);
      return state;
    } catch (err) {
      // No state file found
      return undefined;
    }
  }

  public async save(state: ConstructionState): Promise<void> {
    await this.ensureStateDir();
    const stateFile = this.getStateFilePath(state.stateId);
    await writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
    this.inMemoryStates.set(state.stateId, state);
  }

  public async clear(stateId: string): Promise<void> {
    const stateFile = this.getStateFilePath(stateId);
    try {
      await stat(stateFile);
      await writeFile(stateFile, "", "utf8"); // Clear file
    } catch (err) {
      // Ignore if file doesn't exist
    }
    this.inMemoryStates.delete(stateId);
  }

  public static createInitialState(task: DevTask): ConstructionState {
    const timestamp = new Date().toISOString();
    const stateId = StateManager.getInstance().computeStateId(task);
    return {
      missionId: task.id,
      stateId,
      repository: task.repository,
      validationMode: task.validationMode ?? "required",
      phase: "INITIALIZATION",
      objective: task.description,
      role: "ARCHITECT",
      provider: "freellmapi", // default, will be updated
      model: "", // will be updated
      modelRound: 0,
      lastSuccessfulAction: undefined,
      nextRequiredAction: "Start repository discovery",
      completedActions: [],
      completedArtifacts: {},
      verifiedArtifacts: {},
      relevantEvidence: "",
      repositoryEvidence: "",
      failures: [],
      checkpointTimestamp: timestamp,
      ledger: {
        [task.description]: "IN_PROGRESS"
      },
      architectureText: "",
      implementationText: "",
      reviewTexts: ["", ""],
      validationOutput: "",
      validationAttempted: false,
      validationPassed: false,
      repairAttempts: 0
    };
  }

  public static computeFileFingerprint(content: string): string {
    const hash = createHash('sha256');
    hash.update(content, 'utf8');
    return hash.digest('hex');
  }

  public static addCompletedAction(state: ConstructionState, action: string): void {
    state.completedActions.push(action);
    state.lastSuccessfulAction = action;
    state.checkpointTimestamp = new Date().toISOString();
  }

  public static setNextRequiredAction(state: ConstructionState, action: string): void {
    state.nextRequiredAction = action;
  }

  public static addCompletedArtifact(state: ConstructionState, filePath: string, content: string): void {
    const fingerprint = StateManager.computeFileFingerprint(content);
    state.completedArtifacts[filePath] = { content, fingerprint };
  }

  public static getCompletedArtifact(state: ConstructionState, filePath: string): { content: string; fingerprint: string } | undefined {
    return state.completedArtifacts[filePath];
  }

  public static addVerifiedArtifact(state: ConstructionState, filePath: string, content: string): void {
    const fingerprint = StateManager.computeFileFingerprint(content);
    state.verifiedArtifacts[filePath] = { content, fingerprint };
  }

  public static getVerifiedArtifact(state: ConstructionState, filePath: string): { content: string; fingerprint: string } | undefined {
    return state.verifiedArtifacts[filePath];
  }

  public static addFailure(state: ConstructionState, role: Role, provider: ProviderName, error: string): void {
    state.failures.push({
      timestamp: new Date().toISOString(),
      role,
      provider,
      error
    });
  }

  public static updateLedger(state: ConstructionState, objective: string, status: "DONE" | "IN_PROGRESS" | "NOT_STARTED"): void {
    state.ledger[objective] = status;
  }

  public static setPhase(state: ConstructionState, phase: string): void {
    state.phase = phase;
  }

  public static setRole(state: ConstructionState, role: Role): void {
    state.role = role;
  }

  public static setProviderAndModel(state: ConstructionState, provider: ProviderName, model: string): void {
    state.provider = provider;
    state.model = model;
    state.modelRound = 0; // reset round when model changes
  }

  public static incrementModelRound(state: ConstructionState): void {
    state.modelRound++;
  }

  public static setRelevantEvidence(state: ConstructionState, evidence: string): void {
    state.relevantEvidence = evidence;
  }

  public static setRepositoryEvidence(state: ConstructionState, evidence: string): void {
    state.repositoryEvidence = evidence;
  }

  public static setArchitectureText(state: ConstructionState, text: string): void {
    state.architectureText = text;
  }

  public static setImplementationText(state: ConstructionState, text: string): void {
    state.implementationText = text;
  }

  public static setReviewTexts(state: ConstructionState, primary: string, alternative: string): void {
    state.reviewTexts = [primary, alternative];
  }

  public static setValidationResult(state: ConstructionState, output: string, attempted: boolean, passed: boolean): void {
    state.validationOutput = output;
    state.validationAttempted = attempted;
    state.validationPassed = passed;
  }

  public static incrementRepairAttempts(state: ConstructionState): void {
    state.repairAttempts++;
  }

  public static resetRepairAttempts(state: ConstructionState): void {
    state.repairAttempts = 0;
  }
}