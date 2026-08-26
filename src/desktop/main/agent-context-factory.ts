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
import { createToolRegistry } from "../../tools/registry.js";
import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { AgentRuntimeEvents } from "./agent-runtime-events.js";
import type { ProfileProposalExecutor } from "../../profile/types.js";
import type { ResumeExperienceSyncProposalPort } from "../../resume/material/experience-sync-port.js";
import { createResumeGenerationFollowUp } from "./resume-generation-follow-up.js";
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
import { InboxSignalApplicationService } from "./agent-task/inbox-signal-application-service.js";
import { InboxSignalInterviewService } from "./agent-task/inbox-signal-interview-service.js";
import type { InterviewSyncStore } from "./tracker/interview-sync-store.js";
import type { InterviewProposalService } from "./tracker/interview-proposal-service.js";
import { toolsForConversationRun } from "./agent-task/conversation-tool-scope.js";

export interface AgentContextFactoryDependencies {
  apiClient: CooltoApiClient;
  resumeCompiler: ResumePdfCompiler;
  selectedFiles: ConversationSelectedFiles;
  browserAgentController: BrowserAgentController;
  browserPageOperator: BrowserPageOperator;
  agentHarness: AgentHarnessServices;
  agentTaskProposals: AgentTaskProposalService;
  applications: ApplicationSyncStore;
  applicationProposals: ApplicationProposalService;
  mailConnections: MailConnectionRegistry;
  interviews: InterviewSyncStore;
  interviewProposals: InterviewProposalService;
  resumePublications: ResumePublicationGateway;
  experiences: ExperienceReader & ExperienceWriter;
  jds: JdReader & JdWriter;
  profiles: UserProfileReader;
  profileProposals: ProfileProposalExecutor;
  experienceSyncProposals: ResumeExperienceSyncProposalPort;
  events: AgentRuntimeEvents;
  traces: ResumeGenerationTraceStore;
  /** Immediately runs one sync round (agent sync_now tool). */
  syncNow: () => Promise<{ ok: boolean; message: string }>;
}

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
    const resumeCompiler = new TracedResumeCompiler(
      deps.resumeCompiler,
      deps.traces,
      conversationId,
    );
    const inboxApplication = new InboxSignalApplicationService(
      conversationId, deps.agentHarness, deps.applications,
    );
    const inboxInterview = new InboxSignalInterviewService(
      conversationId, deps.agentHarness, deps.applications,
      deps.interviews, deps.interviewProposals,
    );
    const approvalManager = createActionApprovalManager({
      experienceWriter: deps.experiences,
      importProposalStore: proposalStore,
      profileProposals: deps.profileProposals,
      jdWriter: deps.jds,
      jdProposalStore,
      browserPageOperator: deps.browserPageOperator,
      resumeWorkspaceStore: workspaceStore,
      resumeCompiler,
      resumeExperienceSyncProposals: deps.experienceSyncProposals,
      agentTaskProposals: deps.agentTaskProposals,
      answerVault: deps.agentHarness.answers,
      inboxApplicationProposals: inboxApplication,
      inboxInterviewProposals: inboxInterview,
    });
    const sourceBuilder = new ResumeSourceSnapshotBuilder({
      currentUser: deps.apiClient,
      profile: deps.profiles,
      jd: deps.jds,
      experience: deps.experiences,
    });
    const currentUserMessage = { timestamp: undefined as number | undefined };
    const modelDependencies = createConfiguredModelDependencies(
      config,
      () => deps.apiClient.getSessionToken(),
    );
    const taskLifecycle = new TaskLifecycleController(
      conversationId,
      deps.agentHarness,
    );
    const jobScout = new JobScoutController(conversationId, deps.agentHarness);
    const applicationSubmission = new ApplicationSubmissionService(
      conversationId, deps.agentHarness, deps.browserAgentController,
      deps.jds, deps.resumePublications, deps.applicationProposals,
    );
    const inboxSignals = new InboxSignalController(
      conversationId, deps.agentHarness, deps.mailConnections,
      [new GmailInboxAdapter(), new OutlookInboxAdapter()], deps.applications,
      deps.browserAgentController,
      isBe2SitePolicyAllowed,
    );
    const tools = createToolRegistry({
      currentUserReader: deps.apiClient,
      userProfileReader: deps.profiles,
      profileProposals: deps.profileProposals,
      experienceReader: deps.experiences,
      jdReader: deps.jds,
      resumeReader: deps.resumePublications,
      importProposalStore: proposalStore,
      jdProposalStore,
      matchReportStore,
      approvalManager,
      selectedFileRegistry: selectedFiles,
      browserPageReader: deps.browserAgentController,
      browserAgentController: deps.browserAgentController,
      browserPageOperator: deps.browserPageOperator,
      agentTaskLifecycle: taskLifecycle,
      agentTaskProposals: deps.agentTaskProposals,
      conversationId,
      jobScout,
      applicationSubmission,
      answerVault: deps.agentHarness.answers,
      inboxSignals,
      inboxApplicationProposals: inboxApplication,
      inboxInterviewProposals: inboxInterview,
      agentOrchestrated: {
        snapshotBuilder: sourceBuilder,
        compiler: resumeCompiler,
        store: workspaceStore,
        resumeReader: deps.resumePublications,
        currentUserMessageTimestamp: () => currentUserMessage.timestamp,
        approvalManager,
        experienceSyncProposals: deps.experienceSyncProposals,
      },
      syncNow: deps.syncNow,
    });
    const taskPolicy = new ManagedTaskPolicyHooks({
      conversationId,
      services: deps.agentHarness,
      browser: deps.browserAgentController,
      tools,
      sitePolicyAllows: isBe2SitePolicyAllowed,
      grantBrowserAccess: (reason) => deps.browserPageOperator.grantWriteAccess(reason),
    });
    const agent = createCooltoAgent({
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      modelId: config.modelId,
      thinkingLevel: config.thinkingLevel,
      approvalManager,
      tools,
      beforeToolCall: taskPolicy.beforeToolCall,
      afterToolCall: taskPolicy.afterToolCall,
      shouldStopAfterTurn: createResumeInteractionStop(workspaceStore),
      automaticFollowUp: createResumeGenerationFollowUp(workspaceStore),
    }, modelDependencies);
    const context: ConversationAgentContext = {
      agent,
      workspaceStore,
      resumeCompiler,
      jdProposalStore,
      matchReportStore,
      scopeTools: async () => agent.setTools(toolsForConversationRun(
        tools,
        Boolean(await deps.agentHarness.tasks.findRunningByConversation(conversationId)),
      )),
      artifactIdByCandidate: new Map(),
      currentUserMessage,
      compaction: {
        ...(modelDependencies.models ? { models: modelDependencies.models } : {}),
        model: modelDependencies.model,
      },
    };
    deps.events.subscribe(conversationId, context);
    return context;
  }
}
