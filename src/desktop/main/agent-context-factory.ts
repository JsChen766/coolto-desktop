import { createActionApprovalManager } from "../../actions/create-action-approvals.js";
import { createCooltoAgent } from "../../agent/create-agent.js";
import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { ExperienceReader, ExperienceWriter, JdReader, JdWriter, UserProfileReader } from "../../api/types.js";
import type { BrowserPageOperator, BrowserPageReader } from "../../browser/types.js";
import { readConfig } from "../../config.js";
import { ExperienceImportProposalStore } from "../../import/proposal-store.js";
import { JdProposalStore } from "../../jd/proposal-store.js";
import { MatchReportStore } from "../../match/report-store.js";
import type { ResumePdfCompiler, ResumePdfExportGateway } from "../../resume/export/types.js";
import { ResumePdfExportProposalBuilder } from "../../resume/export/proposal-builder.js";
import { ResumePdfExportSourceResolver } from "../../resume/export/source-resolver.js";
import { ResumeAlternativeRepairer } from "../../resume/quality/alternative-repairer.js";
import { ResumeCandidateReviewer } from "../../resume/quality/candidate-reviewer.js";
import { ResumeQualityEvaluator } from "../../resume/quality/quality-evaluator.js";
import { ResumeSaveProposalBuilder } from "../../resume/save/proposal-builder.js";
import type { ResumePublicationGateway } from "../../resume/save/types.js";
import { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import { ResumeCandidatePatcher } from "../../resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../../resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { TracedResumeCompiler } from "../../resume/performance/traced-compiler.js";
import { ResumeGenerationTraceStore } from "../../resume/performance/generation-trace-store.js";
import { createToolRegistry } from "../../tools/registry.js";
import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { AgentRuntimeEvents } from "./agent-runtime-events.js";
import type { ProfileProposalExecutor } from "../../profile/types.js";

export interface AgentContextFactoryDependencies {
  apiClient: CooltoApiClient;
  resumeCompiler: ResumePdfCompiler;
  resumePdfExports: ResumePdfExportGateway;
  selectedFiles: ConversationSelectedFiles;
  browserPageReader: BrowserPageReader;
  browserPageOperator: BrowserPageOperator;
  resumePublications: ResumePublicationGateway;
  experiences: ExperienceReader & ExperienceWriter;
  jds: JdReader & JdWriter;
  profiles: UserProfileReader;
  profileProposals: ProfileProposalExecutor;
  events: AgentRuntimeEvents;
  traces: ResumeGenerationTraceStore;
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
    const approvalManager = createActionApprovalManager({
      experienceWriter: deps.experiences,
      importProposalStore: proposalStore,
      profileProposals: deps.profileProposals,
      jdWriter: deps.jds,
      jdProposalStore,
      resumePublications: deps.resumePublications,
      resumePdfExports: deps.resumePdfExports,
      browserPageOperator: deps.browserPageOperator,
    });
    const sourceBuilder = new ResumeSourceSnapshotBuilder({
      currentUser: deps.apiClient,
      profile: deps.profiles,
      jd: deps.jds,
      experience: deps.experiences,
    });
    const workspaceStore = new ResumeWorkspaceStore();
    const resumeCompiler = new TracedResumeCompiler(
      deps.resumeCompiler,
      deps.traces,
      conversationId,
    );
    const qualityEvaluator = new ResumeQualityEvaluator();
    const resumeCandidatePreparer = new ResumeCandidatePreparer(
      sourceBuilder,
      resumeCompiler,
      workspaceStore,
    );
    const resumeCandidatePatcher = new ResumeCandidatePatcher(
      resumeCompiler,
      workspaceStore,
    );
    const resumeCandidateReviewer = new ResumeCandidateReviewer(
      qualityEvaluator,
      workspaceStore,
    );
    const resumeAlternativeRepairer = new ResumeAlternativeRepairer(
      resumeCompiler,
      qualityEvaluator,
      workspaceStore,
    );
    const resumeSaveProposalBuilder = new ResumeSaveProposalBuilder(
      workspaceStore,
    );
    const resumePdfExportProposalBuilder = new ResumePdfExportProposalBuilder(
      new ResumePdfExportSourceResolver(
        workspaceStore,
        deps.resumePublications,
      ),
        resumeCompiler,
    );
    const agent = createCooltoAgent({
      apiKey: config.apiKey,
      modelId: config.modelId,
      approvalManager,
      tools: createToolRegistry({
        currentUserReader: deps.apiClient,
        userProfileReader: deps.profiles,
        experienceReader: deps.experiences,
        jdReader: deps.jds,
        resumeReader: deps.resumePublications,
        resumeSourceSnapshotBuilder: sourceBuilder,
        resumeCandidatePreparer,
        resumeCandidatePatcher,
        resumeCandidateReviewer,
        resumeAlternativeRepairer,
        resumeSaveProposalBuilder,
        resumePdfExportProposalBuilder,
        importProposalStore: proposalStore,
        jdProposalStore,
        matchReportStore,
        approvalManager,
        selectedFileRegistry: selectedFiles,
        browserPageReader: deps.browserPageReader,
        browserPageOperator: deps.browserPageOperator,
      }),
    });
    const context: ConversationAgentContext = {
      agent,
      workspaceStore,
      resumeCompiler,
      jdProposalStore,
      matchReportStore,
      artifactIdByCandidate: new Map(),
    };
    deps.events.subscribe(conversationId, context);
    return context;
  }
}
