import type { AgentTool } from "@earendil-works/pi-agent-core";
import type {
  CurrentUserReader,
  ExperienceReader,
  JdReader,
  UserProfileReader,
} from "../api/types.js";
import { ApprovalManager } from "../approvals/approval-manager.js";
import { ExperienceImportProposalStore } from "../import/proposal-store.js";
import { JdProposalStore } from "../jd/proposal-store.js";
import type { ResumePublicationGateway } from "../resume/save/types.js";
import { createGetCurrentUserTool } from "./get-current-user.js";
import { createGetUserProfileTool } from "./get-user-profile.js";
import { createPrepareProfileUpdateTool } from "./prepare-profile-update.js";
import { createPrepareExperienceImportTool } from "./import-experiences/prepare-import.js";
import { createExtractPageTool } from "./extract-page.js";
import {
  createBrowserControlTools,
  createBrowserWriteTools,
} from "./browser/index.js";
import { createPrepareJdImportTool } from "./prepare-jd-import.js";
import { createRuntimeInfoTool } from "./runtime-info.js";
import { createJdTools } from "./jd-tools.js";
import { createSyncNowTool, type SyncNowResult } from "./sync-now.js";
import { createResumeReadTools } from "./resume-tools.js";
import { MatchReportStore } from "../match/report-store.js";
import { createPrepareMatchAnalysisTool } from "./prepare-match-analysis.js";
import type { BrowserPageOperator, BrowserPageReader } from "../browser/types.js";
import type { BrowserAgentController } from "../browser/agent-control-types.js";
import {
  createAgentOrchestratedTools,
  type AgentOrchestratedDependencies,
} from "./agent-orchestrated/index.js";
import type { ProfileProposalExecutor } from "../profile/types.js";
import { ExperienceReferenceRegistry } from "./experience-reference-registry.js";
import { applyToolCapabilities } from "./tool-capabilities.js";
import type { CapabilityAgentTool } from "./tool-capabilities.js";
import { createExperienceTools } from "./experience-tool-registry.js";
import type { ExperienceMaterialIngestionStore } from
  "../experience/material-ingestion-store.js";
import type { TaskLifecycleController } from "../agent-task/task-lifecycle-controller.js";
import { createAgentTaskLifecycleTools } from "./agent-task-lifecycle.js";
import type { AgentTaskProposalService } from "../desktop/main/agent-task/agent-task-proposal-service.js";
import { createPrepareAgentTaskTool } from "./prepare-agent-task.js";
import { applyExecutionPolicies } from "./tool-execution-policies.js";
import type { JobScoutController } from "../job-scout/job-scout-controller.js";
import { createJobScoutTools } from "./job-scout-tools.js";
import type { ApplicationSubmissionService } from "../desktop/main/agent-task/application-submission-service.js";
import { createApplicationSubmissionTools } from "./application-submission-tools.js";
import type { AnswerVaultStore } from "../agent-task/answer-vault-store.js";
import { createAnswerVaultTools } from "./answer-vault-tools.js";
import type { InboxSignalController } from "../inbox-signals/inbox-signal-controller.js";
import { createInboxSignalTools } from "./inbox-signal-tools.js";
import type { InboxSignalApplicationService } from "../desktop/main/agent-task/inbox-signal-application-service.js";
import { createPrepareInboxApplicationTool } from "./inbox-action-tools.js";
import type { InboxSignalInterviewService } from "../desktop/main/agent-task/inbox-signal-interview-service.js";
import { createPrepareInboxInterviewTool } from "./inbox-interview-tools.js";
import {
  createLocalFileTools,
  type LocalFileToolDependencies,
} from "./local-file-tools.js";
export interface ToolRegistryDependencies extends LocalFileToolDependencies {
  currentUserReader?: CurrentUserReader;
  userProfileReader?: UserProfileReader;
  profileProposals?: ProfileProposalExecutor;
  experienceReader?: ExperienceReader;
  experienceMaterialIngestion?: ExperienceMaterialIngestionStore;
  jdReader?: JdReader;
  resumeReader?: ResumePublicationGateway;
  importProposalStore?: ExperienceImportProposalStore;
  jdProposalStore?: JdProposalStore;
  approvalManager?: ApprovalManager;
  matchReportStore?: MatchReportStore;
  browserPageReader?: BrowserPageReader;
  browserAgentController?: BrowserAgentController;
  browserPageOperator?: BrowserPageOperator;
  agentTaskLifecycle?: TaskLifecycleController;
  agentTaskProposals?: AgentTaskProposalService;
  conversationId?: string;
  jobScout?: JobScoutController;
  applicationSubmission?: ApplicationSubmissionService;
  answerVault?: AnswerVaultStore;
  inboxSignals?: InboxSignalController;
  inboxApplicationProposals?: InboxSignalApplicationService;
  inboxInterviewProposals?: InboxSignalInterviewService;
  agentOrchestrated?: AgentOrchestratedDependencies;
  /** Immediately runs one sync round; resolves with a result summary. */
  syncNow?: () => Promise<SyncNowResult>;
}
/**
 * This is the only place where tools are exposed to the model.
 * Business tools will be added here after their API adapters and policies exist.
 */
export function createToolRegistry(
  dependencies: ToolRegistryDependencies = {},
): CapabilityAgentTool[] {
  const experienceReferences = new ExperienceReferenceRegistry(() =>
    dependencies.agentOrchestrated?.store.latest()?.sourceSnapshot.experiences
      .map((experience) => experience.id)
  );
  const businessTools: AgentTool[] = [];

  if (dependencies.syncNow) {
    businessTools.push(createSyncNowTool(dependencies.syncNow));
  }
  if (dependencies.currentUserReader) {
    businessTools.push(
      createGetCurrentUserTool(dependencies.currentUserReader),
    );
  }
  if (dependencies.userProfileReader) {
    businessTools.push(createGetUserProfileTool(dependencies.userProfileReader));
  }
  if (
    dependencies.userProfileReader &&
    dependencies.profileProposals &&
    dependencies.approvalManager
  ) {
    businessTools.push(
      createPrepareProfileUpdateTool(
        dependencies.userProfileReader,
        dependencies.profileProposals,
        dependencies.approvalManager,
      ),
    );
  }
  if (dependencies.jdReader) {
    businessTools.push(...createJdTools(dependencies.jdReader));
  }
  if (dependencies.resumeReader) {
    businessTools.push(...createResumeReadTools(dependencies.resumeReader, dependencies.jdReader, dependencies.agentOrchestrated?.resumeDraftReader));
  }
  businessTools.push(...createExperienceTools(dependencies));
  if (
    dependencies.experienceReader &&
    dependencies.importProposalStore &&
    dependencies.approvalManager
  ) {
    businessTools.push(
      createPrepareExperienceImportTool(
        dependencies.experienceReader,
        dependencies.userProfileReader,
        dependencies.importProposalStore,
        dependencies.approvalManager,
      ),
    );
  }
  if (dependencies.jdProposalStore && dependencies.approvalManager) {
    businessTools.push(
      createPrepareJdImportTool(
        dependencies.jdProposalStore,
        dependencies.approvalManager,
      ),
    );
  }
  businessTools.push(...createLocalFileTools(dependencies));
  if (
    dependencies.jdReader &&
    dependencies.experienceReader &&
    dependencies.matchReportStore
  ) {
    businessTools.push(
      createPrepareMatchAnalysisTool(
        dependencies.jdReader,
        dependencies.experienceReader,
        dependencies.matchReportStore,
      ),
    );
  }
  if (dependencies.browserPageReader) {
    businessTools.push(createExtractPageTool(dependencies.browserPageReader));
  }
  if (
    dependencies.browserAgentController &&
    dependencies.browserPageOperator &&
    dependencies.approvalManager
  ) {
    businessTools.push(
      ...createBrowserControlTools(dependencies.browserAgentController),
    );
  }
  if (dependencies.jobScout) {
    businessTools.push(...createJobScoutTools(dependencies.jobScout));
  }
  if (dependencies.applicationSubmission) {
    businessTools.push(...createApplicationSubmissionTools(dependencies.applicationSubmission));
  }
  if (dependencies.answerVault) {
    businessTools.push(...createAnswerVaultTools({
      store: dependencies.answerVault,
      ...(dependencies.approvalManager
        ? { approvals: dependencies.approvalManager }
        : {}),
    }));
  }
  if (dependencies.inboxSignals) businessTools.push(...createInboxSignalTools(dependencies.inboxSignals));
  if (dependencies.inboxApplicationProposals && dependencies.approvalManager) {
    businessTools.push(createPrepareInboxApplicationTool({
      proposals: dependencies.inboxApplicationProposals, approvals: dependencies.approvalManager,
    }));
  }
  if (dependencies.inboxInterviewProposals && dependencies.approvalManager) {
    businessTools.push(createPrepareInboxInterviewTool({
      proposals: dependencies.inboxInterviewProposals,
      approvals: dependencies.approvalManager,
    }));
  }
  if (dependencies.browserPageOperator && dependencies.approvalManager) {
    businessTools.push(
      ...createBrowserWriteTools(
        dependencies.browserPageOperator,
        dependencies.approvalManager,
      ),
    );
  }
  if (dependencies.agentOrchestrated) {
    businessTools.push(
      ...createAgentOrchestratedTools(dependencies.agentOrchestrated),
    );
  }
  if (dependencies.agentTaskLifecycle) {
    businessTools.push(
      ...createAgentTaskLifecycleTools(dependencies.agentTaskLifecycle),
    );
  }
  if (
    dependencies.agentTaskProposals &&
    dependencies.conversationId &&
    dependencies.approvalManager
  ) {
    businessTools.push(createPrepareAgentTaskTool({
      conversationId: dependencies.conversationId,
      proposals: dependencies.agentTaskProposals,
      approvals: dependencies.approvalManager,
    }));
  }

  return applyToolCapabilities(
    applyExecutionPolicies([
      createRuntimeInfoTool(businessTools.map((tool) => tool.name)),
      ...businessTools,
    ]).map((tool) => experienceReferences.wrap(tool)),
  );
}
