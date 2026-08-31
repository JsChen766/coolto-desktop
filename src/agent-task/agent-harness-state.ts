import type { EnvironmentEventV1 } from "./environment-event-types.js";
import type {
  DelegationGrantV1,
  GrantRevocationV1,
  PolicyDecisionV1,
} from "./grant-types.js";
import type { ActionReceiptV1, ActionTokenV1 } from "./receipt-types.js";
import type { AgentCheckpointV1, AgentRunV1, AgentTaskV1 } from "./task-types.js";
import type {
  BrowserLeadEvaluationV1,
  BrowserLeadV1,
  JobSourceCursorV1,
} from "./browser-lead-types.js";
import type { SubmissionIntentV1, SubmissionReceiptV1 } from "./submission-types.js";
import type { AnswerVaultEntryV1 } from "./answer-vault-types.js";
import type { ExternalSignalV1, InboxCursorV1 } from "../inbox-signals/inbox-signal-types.js";
import type { AiNativeArtifactV1 } from "./ai-native-artifact-types.js";

export interface AgentHarnessStateV1 {
  version: 1;
  ownerId: string;
  tasks: AgentTaskV1[];
  runs: AgentRunV1[];
  checkpoints: AgentCheckpointV1[];
  grants: DelegationGrantV1[];
  revocations: GrantRevocationV1[];
  policyDecisions: PolicyDecisionV1[];
  events: EnvironmentEventV1[];
  actionTokens: ActionTokenV1[];
  actionReceipts: ActionReceiptV1[];
  browserLeads: BrowserLeadV1[];
  leadEvaluations: BrowserLeadEvaluationV1[];
  jobSourceCursors: JobSourceCursorV1[];
  submissionIntents: SubmissionIntentV1[];
  submissionReceipts: SubmissionReceiptV1[];
  answerVault: AnswerVaultEntryV1[];
  inboxCursors: InboxCursorV1[];
  externalSignals: ExternalSignalV1[];
  aiNativeArtifacts: AiNativeArtifactV1[];
  updatedAt: string;
}

export function emptyAgentHarnessState(ownerId: string): AgentHarnessStateV1 {
  return {
    version: 1, ownerId, tasks: [], runs: [], checkpoints: [], grants: [],
    revocations: [], policyDecisions: [], events: [], actionTokens: [],
    actionReceipts: [],
    browserLeads: [], leadEvaluations: [], jobSourceCursors: [],
    submissionIntents: [], submissionReceipts: [],
    answerVault: [],
    inboxCursors: [], externalSignals: [], aiNativeArtifacts: [],
    updatedAt: new Date(0).toISOString(),
  };
}
