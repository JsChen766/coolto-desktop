import type { CapabilityAgentTool } from "../../tools/tool-capabilities.js";
import type { ApprovalManager } from "../../approvals/approval-manager.js";
import type { SelectedFileRegistry } from "../../files/selected-file-registry.js";
import type { ExperienceImportProposalStore } from "../../import/proposal-store.js";
import type { JdProposalStore } from "../../jd/proposal-store.js";
import type { MatchReportStore } from "../../match/report-store.js";
import type { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import type { TracedResumeCompiler } from "../../resume/performance/traced-compiler.js";
import type { ExperienceMaterialIngestionStore } from "../../experience/material-ingestion-store.js";
import type { ConversationSelectedFiles } from "./conversation-selected-files.js";
import type { InboxSignalApplicationService } from "./agent-task/inbox-signal-application-service.js";
import type { InboxSignalInterviewService } from "./agent-task/inbox-signal-interview-service.js";
import type { InboxSignalController } from "../../inbox-signals/inbox-signal-controller.js";
import type { InboxApplicationCandidateReader } from "../../inbox-signals/inbox-application-candidate-reader.js";
import type { ApplicationSubmissionService } from "./agent-task/application-submission-service.js";
import type { AiNativeLoopService } from "./agent-task/ai-native-loop-service.js";
import type { TaskLifecycleController } from "../../agent-task/task-lifecycle-controller.js";
import type { JobScoutController } from "../../job-scout/job-scout-controller.js";
import { createToolRegistry } from "../../tools/registry.js";
import type { AgentContextFactoryDependencies } from "./agent-context-factory.js";
import type { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import { resolveResumeProfilePreferenceContext } from "./profile-preference-context.js";
import type { ResumeProfilePreferenceBinding } from "../../resume/workspace/profile-preference-binding.js";

export interface AgentToolAssemblyInput {
  deps: AgentContextFactoryDependencies;
  conversationId: string;
  currentUserMessage: { timestamp: number | undefined };
  selectedFiles: SelectedFileRegistry;
  proposalStore: ExperienceImportProposalStore;
  jdProposalStore: JdProposalStore;
  matchReportStore: MatchReportStore;
  workspaceStore: ResumeWorkspaceStore;
  resumeCompiler: TracedResumeCompiler;
  approvalManager: ApprovalManager;
  materialIngestion: ExperienceMaterialIngestionStore;
  taskLifecycle: TaskLifecycleController;
  jobScout: JobScoutController;
  inboxSignals: InboxSignalController;
  inboxApplicationCandidates: InboxApplicationCandidateReader;
  inboxApplication: InboxSignalApplicationService;
  inboxInterview: InboxSignalInterviewService;
  applicationSubmission: ApplicationSubmissionService;
  aiNativeLoops: AiNativeLoopService;
  sourceBuilder: ResumeSourceSnapshotBuilder;
}

export function createAgentContextTools(input: AgentToolAssemblyInput): CapabilityAgentTool[] {
  const { deps } = input;
  return createToolRegistry({
    currentUserReader: deps.apiClient, userProfileReader: deps.profiles,
    profileProposals: deps.profileProposals, preferences: deps.preferences,
    preferenceProposals: deps.preferenceProposals,
    preferenceUsage: deps.preferenceSuggestions, preferenceOwnerId: deps.ownerId,
    experienceReader: deps.experiences,     experienceMaterialIngestion: input.materialIngestion,
    materialHost: deps.materialHost,
    jdReader: deps.jds, resumeReader: deps.resumePublications,
    importProposalStore: input.proposalStore, jdProposalStore: input.jdProposalStore,
    matchReportStore: input.matchReportStore, approvalManager: input.approvalManager,
    selectedFileRegistry: input.selectedFiles, deliveryResumeFiles: deps.deliveryResumeFiles,
    managedResumeUploads: deps.managedResumeUploads, aiNativeLoops: input.aiNativeLoops,
    browserPageReader: deps.browserAgentController, browserAgentController: deps.browserAgentController,
    browserPageOperator: deps.browserPageOperator, agentTaskLifecycle: input.taskLifecycle,
    agentTaskProposals: deps.agentTaskProposals, conversationId: input.conversationId,
    jobScout: input.jobScout, applicationSubmission: input.applicationSubmission,
    applications: deps.applications, interviews: deps.interviews,
    answerVault: deps.agentHarness.answers, inboxSignals: input.inboxSignals,
    inboxApplicationCandidates: input.inboxApplicationCandidates,
    inboxApplicationProposals: input.inboxApplication,
    inboxInterviewProposals: input.inboxInterview,
    agentOrchestrated: {
      snapshotBuilder: input.sourceBuilder, compiler: input.resumeCompiler,
      store: input.workspaceStore, resumeReader: deps.resumePublications,
      resumeDraftReader: deps.resumeDrafts,
      profilePreferenceContext: () => readProfilePreferenceBinding(input),
      currentUserMessageTimestamp: () => input.currentUserMessage.timestamp,
      approvalManager: input.approvalManager,
      experienceSyncProposals: deps.experienceProposals,
    },
    syncNow: deps.syncNow,
  });
}

async function readProfilePreferenceBinding(
  input: AgentToolAssemblyInput,
): Promise<ResumeProfilePreferenceBinding> {
  const context = await resolveResumeProfilePreferenceContext(
    input.deps.ownerId, input.conversationId, input.deps.profiles, input.deps.preferences,
  );
  const { resolution: _resolution, ...binding } = context;
  return binding;
}
