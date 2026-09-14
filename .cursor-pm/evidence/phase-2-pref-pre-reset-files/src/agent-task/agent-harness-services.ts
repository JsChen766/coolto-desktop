import { ActionLedger } from "./action-ledger.js";
import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import { AgentTaskStore } from "./agent-task-store.js";
import { DelegationGrantStore } from "./delegation-grant-store.js";
import { EnvironmentEventStore } from "./environment-event-store.js";
import { AiNativeArtifactStore } from "./ai-native-artifact-store.js";
import { PolicyDecisionStore } from "./policy-decision-store.js";
import type { AgentEvidenceStore } from "./evidence-types.js";
import { BrowserLeadStore } from "./browser-lead-store.js";
import { SubmissionStore } from "./submission-store.js";
import { AnswerVaultStore } from "./answer-vault-store.js";
import { ExternalSignalStore } from "./external-signal-store.js";
import { AgentRuntimeProjectionObserver } from "./runtime-projection-observer.js";
import { PreferenceSuggestionStore } from "../desktop/main/agent-task/preference-suggestion-store.js";
import { TaskStageController, type CapabilityStage, type ProfilePreferenceContextSnapshot, type StageTransitionV1 } from "./stage-policy.js";
export class AgentHarnessServices {
  readonly tasks: AgentTaskStore;
  readonly grants: DelegationGrantStore;
  readonly events: EnvironmentEventStore;
  readonly aiNativeArtifacts: AiNativeArtifactStore;
  readonly ledger: ActionLedger;
  readonly policyDecisions: PolicyDecisionStore;
  readonly leads: BrowserLeadStore;
  readonly submissions: SubmissionStore;
  readonly answers: AnswerVaultStore;
  readonly signals: ExternalSignalStore;
  readonly preferenceSuggestions: PreferenceSuggestionStore;
  readonly stages = new TaskStageController();
  readonly runtimeProjection = new AgentRuntimeProjectionObserver();
  profilePreferenceContext?: () => Promise<ProfilePreferenceContextSnapshot>;

  public constructor(
    ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
    readonly evidence?: AgentEvidenceStore,
  ) {
    this.tasks = new AgentTaskStore(ownerId, repository);
    this.grants = new DelegationGrantStore(ownerId, repository);
    this.events = new EnvironmentEventStore(ownerId, repository);
    this.aiNativeArtifacts = new AiNativeArtifactStore(ownerId, repository);
    this.ledger = new ActionLedger(ownerId, repository);
    this.policyDecisions = new PolicyDecisionStore(ownerId, repository);
    this.leads = new BrowserLeadStore(ownerId, repository);
    this.submissions = new SubmissionStore(ownerId, repository);
    this.answers = new AnswerVaultStore(ownerId, repository);
    this.signals = new ExternalSignalStore(ownerId, repository);
    this.preferenceSuggestions = new PreferenceSuggestionStore(ownerId, repository);
  }

  public clearAll(): Promise<void> {
    this.stages.clearAll();
    return Promise.all([
      this.repository.clear(),
      this.evidence?.clearAll() ?? Promise.resolve(),
    ]).then(() => undefined);
  }

  public async transitionStage(input: {
    ownerId: string;
    taskId: string;
    runId: string;
    grantHash: string;
    to: CapabilityStage;
    profileVersion?: number | null;
    preferenceResolutionHash?: string | null;
    reason: string;
  }): Promise<StageTransitionV1> {
    const transition = this.stages.transition(input);
    await this.repository.update((state) => {
      state.stageTransitions.push(transition);
      const run = state.runs.find((candidate) => candidate.id === input.runId);
      if (run) {
        run.currentStage = transition.to;
        run.stageTransitionId = transition.id;
      }
      return undefined;
    });
    return transition;
  }

  public subscribe(listener: () => void): () => void {
    return this.repository.subscribe(listener);
  }
}
