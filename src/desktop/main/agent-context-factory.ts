import { createActionApprovalManager } from "../../actions/create-action-approvals.js";
import { createCooltoAgent } from "../../agent/create-agent.js";
import { createConfiguredModelDependencies } from "../../agent/create-configured-dependencies.js";
import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { ExperienceReader, ExperienceWriter, JdReader, JdWriter, UserProfileReader } from "../../api/types.js";
import type { BrowserAgentController } from "../../browser/agent-control-types.js";
import type { BrowserPageOperator } from "../../browser/types.js";
import { isBe2SitePolicyAllowed } from "../../browser/be2-site-policy.js";
import type { AgentHarnessServices } from "../../agent-task/agent-harness-services.js";
import { ManagedTaskPolicyHooks } from "../../agent-task/managed-task-policy-hooks.js";
import { TaskLifecycleController } from "../../agent-task/task-lifecycle-controller.js";
import { readConfig } from "../../config.js";
import { ExperienceImportProposalStore } from "../../import/proposal-store.js";
import { JdProposalStore } from "../../jd/proposal-store.js";
import { MatchReportStore } from "../../match/report-store.js";
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import type { ResumePublicationGateway } from "../../resume/save/types.js";
import { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { TracedResumeCompiler } from "../../resume/performance/traced-compiler.js";
import { ResumeGenerationTraceStore } from "../../resume/performance/generation-trace-store.js";
import { createAgentContextTools } from "./agent-context-tools.js";
import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import { AgentRuntimeEvents } from "./agent-runtime-events.js";
import { createTaskStageAdvancer } from "../../agent-task/task-stage-runtime.js";
import type { ConversationAgentContext, ProfilePreferenceAuthority } from "./agent-runtime-context.js";
import type { ProfileProposalExecutor } from "../../profile/types.js";
import type { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import { createResumeGenerationFollowUp, createResumeOutputRepetitionRecovery, createResumeTurnGovernorRecovery } from "./resume-generation-follow-up.js";
import { createResumeInteractionStop } from "./resume-interaction-stop.js";
import type { AgentTaskProposalService } from "./agent-task/agent-task-proposal-service.js";
import { JobScoutController } from "../../job-scout/job-scout-controller.js";
import type { ApplicationProposalService } from "./application-library/application-proposal-service.js";
import { ApplicationSubmissionService } from "./agent-task/application-submission-service.js";
import type { ApplicationSyncStore } from "./application-library/application-sync-store.js";
import type { MailConnectionRegistry } from "../../inbox-signals/inbox-signal-types.js";
import { GmailInboxAdapter } from "../../inbox-signals/gmail-inbox-adapter.js";
import { OutlookInboxAdapter } from "../../inbox-signals/outlook-inbox-adapter.js";
import { InboxSignalController } from "../../inbox-signals/inbox-signal-controller.js";
import { InboxApplicationCandidateReader } from "../../inbox-signals/inbox-application-candidate-reader.js";
import { InboxSignalApplicationService } from "./agent-task/inbox-signal-application-service.js";
import { InboxSignalInterviewService } from "./agent-task/inbox-signal-interview-service.js";
import type { InterviewSyncStore } from "./tracker/interview-sync-store.js";
import type { InterviewProposalService } from "./tracker/interview-proposal-service.js";
import {
  contextForManagedTask,
  toolsForConversationRun,
  type ConversationToolContext,
  type ManagedConversationToolScope,
} from "./agent-task/conversation-tool-scope.js";
import type { DeliveryResumeFileStore } from "../../delivery-resume-files/types.js";
import type { ExperienceProposalService } from "./experience-library/experience-proposal-service.js";
import { LocalExperienceMaterialCommitter } from "./experience-library/experience-material-committer.js";
import { ExperienceMaterialIngestionStore } from "../../experience/material-ingestion-store.js";
import { bindApprovalTaskWake } from "../../agent-task/approval-task-wake-bridge.js";
import type { ManagedResumeUploadService } from "./agent-task/managed-resume-upload-service.js";
import { AiNativeLoopService } from "./agent-task/ai-native-loop-service.js";
import type { ReminderProposalService } from "./tracker/reminder-proposal-service.js";
import { resolveResumeProfilePreferenceContext } from "./profile-preference-context.js";
import type { PreferenceReaderV1 } from "../../preference/types.js";
import type { PreferenceProposalService } from "./preference/preference-proposal-service.js";
import type { PreferenceSuggestionStore } from "./agent-task/preference-suggestion-store.js";
import type { AgentContextFactoryDependencies } from "./agent-context-factory-dependencies.js";
export type { AgentContextFactoryDependencies } from "./agent-context-factory-dependencies.js";
export class AgentContextFactory {
  public constructor(
    private readonly dependencies: AgentContextFactoryDependencies,
  ) {}
  public create(conversationId: string): ConversationAgentContext {
    const deps = this.dependencies;
    const config = readConfig();
    const selectedFiles = deps.selectedFiles.forConversation(conversationId);
    const proposalStore = new ExperienceImportProposalStore();
    const jdProposalStore = new JdProposalStore();
    const matchReportStore = new MatchReportStore();
    const workspaceStore = new ResumeWorkspaceStore();
    const resumeCompiler = new TracedResumeCompiler(deps.resumeCompiler, deps.traces, conversationId);
    const inboxApplication = new InboxSignalApplicationService(conversationId, deps.agentHarness, deps.applications);
    const inboxInterview = new InboxSignalInterviewService(conversationId, deps.agentHarness, deps.applications, deps.interviews, deps.interviewProposals);
    const applicationSubmission = new ApplicationSubmissionService(conversationId, deps.agentHarness,
      deps.browserAgentController, deps.jds, deps.resumePublications,
      deps.applicationProposals, deps.managedResumeUploads);
    const aiNativeLoops = new AiNativeLoopService(conversationId, deps.agentHarness, deps.applications,
      deps.interviews, deps.jds, deps.resumePublications, deps.experiences, deps.reminderProposals);
    const approvalManager = createActionApprovalManager({
      experienceWriter: deps.experiences,
      importProposalStore: proposalStore,
      profileProposals: deps.profileProposals,
      preferenceProposals: deps.preferenceProposals,
      jdWriter: deps.jds,
      jdProposalStore,
      browserPageOperator: deps.browserPageOperator,
      resumeWorkspaceStore: workspaceStore,
      resumeCompiler,
      resumeExperienceSyncProposals: deps.experienceProposals,
      resumeDrafts: deps.resumeDrafts,
      agentTaskProposals: deps.agentTaskProposals,
      answerVault: deps.agentHarness.answers,
      inboxApplicationProposals: inboxApplication,
      inboxInterviewProposals: inboxInterview,
      applicationSubmissions: applicationSubmission,
      aiNativeLoops,
    });
    bindApprovalTaskWake(approvalManager, conversationId, deps.agentHarness);
    const sourceBuilder = new ResumeSourceSnapshotBuilder({ currentUser: deps.apiClient,
      profile: deps.profiles,
      jd: deps.jds,
      experience: deps.experiences,
    });
    const currentUserMessage: { timestamp: number | undefined; text?: string } = { timestamp: undefined };
    const materialIngestion = new ExperienceMaterialIngestionStore(selectedFiles,
      new LocalExperienceMaterialCommitter(deps.experiences, deps.experienceProposals),
      deps.browserAgentController,
      () => currentUserMessage.text,
    );
    const modelDependencies = createConfiguredModelDependencies(
      config,
      () => deps.apiClient.getSessionToken(),
    );
    const taskLifecycle = new TaskLifecycleController(
      conversationId,
      deps.agentHarness,
      (reason) => deps.browserPageOperator.revokeWriteAccess(reason),
    );
    const jobScout = new JobScoutController(conversationId, deps.agentHarness);
    const inboxSignals = new InboxSignalController(
      conversationId, deps.agentHarness, deps.mailConnections,
      [new GmailInboxAdapter(), new OutlookInboxAdapter()], deps.applications,
      deps.browserAgentController,
      isBe2SitePolicyAllowed,
    );
    const inboxApplicationCandidates = new InboxApplicationCandidateReader(
      conversationId, deps.agentHarness, deps.applications,
    );
    const tools = createAgentContextTools({
      deps, conversationId, currentUserMessage, selectedFiles,
      proposalStore, jdProposalStore, matchReportStore, workspaceStore,
      resumeCompiler, approvalManager, materialIngestion, taskLifecycle,
      jobScout, inboxSignals, inboxApplicationCandidates, inboxApplication,
      inboxInterview, applicationSubmission, aiNativeLoops, sourceBuilder,
    });
    const taskPolicy = new ManagedTaskPolicyHooks({
      conversationId,
      services: deps.agentHarness,
      browser: deps.browserAgentController,
      tools,
      sitePolicyAllows: isBe2SitePolicyAllowed,
      grantBrowserAccess: (reason) => deps.browserPageOperator.grantWriteAccess(reason),
      revokeBrowserAccess: (reason) => deps.browserPageOperator.revokeWriteAccess(reason),
    });
    const agent = createCooltoAgent({
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      modelId: config.modelId,
      thinkingLevel: config.thinkingLevel,
      approvalManager,
      tools,
      beforeToolCall: taskPolicy.beforeToolCall,
      afterToolCall: taskPolicy.afterToolCall,
      shouldStopAfterTurn: createResumeInteractionStop(
        workspaceStore,
        () => currentUserMessage.text,
      ),
      automaticFollowUp: createResumeGenerationFollowUp(
        workspaceStore,
        () => currentUserMessage.timestamp,
        () => currentUserMessage.text,
      ),
      outputRepetitionRecovery:
        createResumeOutputRepetitionRecovery(workspaceStore),
      turnGovernorRecovery:
        createResumeTurnGovernorRecovery(workspaceStore),
    }, modelDependencies);
    const loadProfilePreferenceContext = async (): Promise<ProfilePreferenceAuthority> => {
      const context = await resolveResumeProfilePreferenceContext(
        deps.ownerId, conversationId, deps.profiles, deps.preferences,
      );
      return {
        profileVersion: context.profileEntityVersion,
        ...(context.profileLocalVersion === undefined ? {} : {
          profileLocalVersion: context.profileLocalVersion,
        }),
        resolutionHash: context.preferenceResolutionHash,
        targetFingerprint: context.targetFingerprint,
        resolution: context.resolution,
      };
    };
    let context: ConversationAgentContext;
    context = {
      agent,
      sourceBuilder,
      resumeReader: deps.resumePublications,
      workspaceStore,
      resumeCompiler,
      jdProposalStore,
      matchReportStore,
      scopeTools: async () => {
        const task = await deps.agentHarness.tasks.findRunningByConversation(conversationId);
        const active = task ? await deps.agentHarness.grants.getActive(task.id) : undefined;
        const managedScope: ManagedConversationToolScope | false = task
          ? {
              capabilityProfile: task.capabilityProfile,
              allowedActions: active?.grant && !active.revocation
                ? active.grant.allowedActions : [],
            }
          : false;
        // A managed task's capability profile is the authority.  The prompt hint is
        // renderer input and must not be able to widen a task into another domain.
        const resolvedContext = task
          ? contextForManagedTask(task.capabilityProfile)
          : "discovery" as ConversationToolContext;
        agent.setTools(toolsForConversationRun(tools, managedScope, resolvedContext));
      },
      approvalManager,
      experienceSyncProposals: deps.experienceProposals,
      preferences: deps.preferences,
      preferenceSuggestions: deps.preferenceSuggestions,
      advanceTaskStage: createTaskStageAdvancer(
        deps.agentHarness, deps.ownerId, conversationId,
        () => context.profilePreferenceAuthority,
      ),
      refreshProfilePreferenceContext: async () => {
        const authority = await loadProfilePreferenceContext();
        context.profilePreferenceAuthority = authority;
        return authority;
      },
      artifactIdByCandidate: new Map(),
      currentUserMessage,
      compaction: { ...(modelDependencies.models
        ? { models: modelDependencies.models } : {}), model: modelDependencies.model },
    };
    deps.events.subscribe(conversationId, context);
    return context;
  }
}
