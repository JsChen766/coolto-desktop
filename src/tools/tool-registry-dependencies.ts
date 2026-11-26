import type { CurrentUserReader, ExperienceReader, JdReader, UserProfileReader } from "../api/types.js";
import type { SelectedFileRegistry } from "../files/selected-file-registry.js";
import type { ApprovalManager } from "../approvals/approval-manager.js";
import type { ExperienceImportProposalStore } from "../import/proposal-store.js";
import type { JdProposalStore } from "../jd/proposal-store.js";
import type { ResumePublicationGateway } from "../resume/save/types.js";
import type { SyncNowResult } from "./sync-now.js";
import type { MatchReportStore } from "../match/report-store.js";
import type { BrowserPageOperator, BrowserPageReader } from "../browser/types.js";
import type { BrowserAgentController } from "../browser/agent-control-types.js";
import type { AgentOrchestratedDependencies } from "./agent-orchestrated/index.js";
import type { ProfileProposalExecutor } from "../profile/types.js";
import type { ExperienceMaterialIngestionStore } from
  "../experience/material-ingestion-store.js";
import type { MaterialHostPort } from "../material/material-host-contract.js";
import type { TaskLifecycleController } from "../agent-task/task-lifecycle-controller.js";
import type { AgentTaskProposalService } from "../desktop/main/agent-task/agent-task-proposal-service.js";
import type { AiNativeToolDependencies } from "./ai-native-tool-registry.js";
import type { JobScoutController } from "../job-scout/job-scout-controller.js";
import type { ApplicationSubmissionService } from "../desktop/main/agent-task/application-submission-service.js";
import type { AnswerVaultStore } from "../agent-task/answer-vault-store.js";
import type { InboxToolRegistryDependencies } from "./inbox-tool-registry.js";
import type { LocalFileToolDependencies } from "./local-file-tools.js";
import type { PreferenceToolDependencies } from "./preference-tool-registry.js";

/** Host capabilities the tool registry may assemble tools from. */
export interface ToolRegistryDependencies extends
  InboxToolRegistryDependencies, LocalFileToolDependencies,
  AiNativeToolDependencies, PreferenceToolDependencies {
  currentUserReader?: CurrentUserReader;
  userProfileReader?: UserProfileReader;
  profileProposals?: ProfileProposalExecutor;
  experienceReader?: ExperienceReader;
  experienceMaterialIngestion?: ExperienceMaterialIngestionStore;
  materialHost?: MaterialHostPort;
  jdReader?: JdReader;
  resumeReader?: ResumePublicationGateway;
  importProposalStore?: ExperienceImportProposalStore;
  jdProposalStore?: JdProposalStore;
  selectedFileRegistry?: SelectedFileRegistry;
  approvalManager?: ApprovalManager;
  matchReportStore?: MatchReportStore;
  /** Local BYO model id recorded on MatchReport.meta (no secrets). */
  matchModelId?: string;
  browserPageReader?: BrowserPageReader;
  browserAgentController?: BrowserAgentController;
  browserPageOperator?: BrowserPageOperator;
  agentTaskLifecycle?: TaskLifecycleController;
  agentTaskProposals?: AgentTaskProposalService;
  conversationId?: string;
  jobScout?: JobScoutController;
  applicationSubmission?: ApplicationSubmissionService;
  answerVault?: AnswerVaultStore;
  agentOrchestrated?: AgentOrchestratedDependencies;
  syncNow?: () => Promise<SyncNowResult>;
}
