import { createActionApprovalManager } from "../../actions/create-action-approvals.js";
import { createCooltoAgent } from "../../agent/create-agent.js";
import { createConfiguredModelDependencies } from "../../agent/create-configured-dependencies.js";
import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { ExperienceReader, ExperienceWriter, JdReader, JdWriter, UserProfileReader } from "../../api/types.js";
import type { BrowserPageOperator, BrowserPageReader } from "../../browser/types.js";
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

export interface AgentContextFactoryDependencies {
  apiClient: CooltoApiClient;
  resumeCompiler: ResumePdfCompiler;
  selectedFiles: ConversationSelectedFiles;
  browserPageReader: BrowserPageReader;
  browserPageOperator: BrowserPageOperator;
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
    const agent = createCooltoAgent({
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      modelId: config.modelId,
      thinkingLevel: config.thinkingLevel,
      approvalManager,
      tools: createToolRegistry({
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
        browserPageReader: deps.browserPageReader,
        browserPageOperator: deps.browserPageOperator,
        agentOrchestrated: {
          snapshotBuilder: sourceBuilder,
          compiler: resumeCompiler,
          store: workspaceStore,
          currentUserMessageTimestamp: () => currentUserMessage.timestamp,
          approvalManager,
          experienceSyncProposals: deps.experienceSyncProposals,
        },
        syncNow: deps.syncNow,
      }),
      automaticFollowUp: createResumeGenerationFollowUp(workspaceStore),
    }, modelDependencies);
    const context: ConversationAgentContext = {
      agent,
      workspaceStore,
      resumeCompiler,
      jdProposalStore,
      matchReportStore,
      artifactIdByCandidate: new Map(),
      currentUserMessage,
      compaction: {
        models: modelDependencies.models,
        model: modelDependencies.model,
      },
    };
    deps.events.subscribe(conversationId, context);
    return context;
  }
}
