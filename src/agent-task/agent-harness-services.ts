import { ActionLedger } from "./action-ledger.js";
import type { AgentHarnessStateRepository } from "./agent-harness-state-repository.js";
import { AgentTaskStore } from "./agent-task-store.js";
import { DelegationGrantStore } from "./delegation-grant-store.js";
import { EnvironmentEventStore } from "./environment-event-store.js";
import { PolicyDecisionStore } from "./policy-decision-store.js";
import type { AgentEvidenceStore } from "./evidence-types.js";
import { BrowserLeadStore } from "./browser-lead-store.js";
import { SubmissionStore } from "./submission-store.js";
import { AnswerVaultStore } from "./answer-vault-store.js";
import { ExternalSignalStore } from "./external-signal-store.js";

export class AgentHarnessServices {
  readonly tasks: AgentTaskStore;
  readonly grants: DelegationGrantStore;
  readonly events: EnvironmentEventStore;
  readonly ledger: ActionLedger;
  readonly policyDecisions: PolicyDecisionStore;
  readonly leads: BrowserLeadStore;
  readonly submissions: SubmissionStore;
  readonly answers: AnswerVaultStore;
  readonly signals: ExternalSignalStore;

  public constructor(
    ownerId: string,
    private readonly repository: AgentHarnessStateRepository,
    readonly evidence?: AgentEvidenceStore,
  ) {
    this.tasks = new AgentTaskStore(ownerId, repository);
    this.grants = new DelegationGrantStore(ownerId, repository);
    this.events = new EnvironmentEventStore(ownerId, repository);
    this.ledger = new ActionLedger(ownerId, repository);
    this.policyDecisions = new PolicyDecisionStore(ownerId, repository);
    this.leads = new BrowserLeadStore(ownerId, repository);
    this.submissions = new SubmissionStore(ownerId, repository);
    this.answers = new AnswerVaultStore(ownerId, repository);
    this.signals = new ExternalSignalStore(ownerId, repository);
  }

  public clearAll(): Promise<void> {
    return Promise.all([
      this.repository.clear(),
      this.evidence?.clearAll() ?? Promise.resolve(),
    ]).then(() => undefined);
  }
}
