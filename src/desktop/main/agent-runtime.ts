import type { WebContents } from "electron";

import { createActionApprovalManager } from "../../actions/create-action-approvals.js";
import { createCooltoAgent } from "../../agent/create-agent.js";
import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { ApprovalDecision } from "../../approvals/types.js";
import type { BrowserPageOperator, BrowserPageReader } from "../../browser/types.js";
import {
  buildJdContinuationPrompt,
  prepareJdContinuation,
} from "./jd-continuation.js";
import {
  buildBrowserWriteAccessContinuationPrompt,
  prepareBrowserWriteAccessContinuation,
} from "./browser-write-access-continuation.js";
import { readConfig } from "../../config.js";
import { ExperienceImportProposalStore } from "../../import/proposal-store.js";
import { JdProposalStore } from "../../jd/proposal-store.js";
import { MatchReportStore } from "../../match/report-store.js";
import { createMatchEmitter } from "./match-emitter.js";
import { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import { ResumeCandidatePatcher } from "../../resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../../resume/workspace/candidate-preparer.js";
import type {
  ResumePdfCompiler,
  ResumePdfExportGateway,
} from "../../resume/export/types.js";
import { ResumePdfExportSourceResolver } from "../../resume/export/source-resolver.js";
import { ResumePdfExportProposalBuilder } from "../../resume/export/proposal-builder.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { ResumeQualityEvaluator } from "../../resume/quality/quality-evaluator.js";
import { ResumeCandidateReviewer } from "../../resume/quality/candidate-reviewer.js";
import { ResumeAlternativeRepairer } from "../../resume/quality/alternative-repairer.js";
import { ResumeSaveProposalBuilder } from "../../resume/save/proposal-builder.js";
import type { ResumePublicationGateway } from "../../resume/save/types.js";
import type {
  ExperienceReader,
  ExperienceWriter,
  JdReader,
  JdWriter,
} from "../../api/types.js";
import { createToolRegistry } from "../../tools/registry.js";
import type {
  AgentPromptInput,
  ConversationDetail,
  DesktopAgentEvent,
} from "../shared/types.js";
import { ConversationStore } from "./conversation-store.js";
import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";

interface ConversationAgentContext {
  agent: CooltoAgent;
  workspaceStore: ResumeWorkspaceStore;
  jdProposalStore: JdProposalStore;
  matchReportStore: MatchReportStore;
  artifactIdByCandidate: Map<string, string>;
  activeEdit?: {
    artifactId: string;
    base: NonNullable<ReturnType<ResumeWorkspaceStore["latest"]>>;
    summary: string;
  };
}

export class DesktopAgentRuntime {
  readonly #apiClient: CooltoApiClient;
  readonly #store: ConversationStore;
  readonly #resumeDrafts: ResumeDraftService;
  readonly #target: WebContents;
  readonly #resumeCompiler: ResumePdfCompiler;
  readonly #resumePdfExports: ResumePdfExportGateway;
  readonly #selectedFiles: ConversationSelectedFiles;
  readonly #browserPageReader: BrowserPageReader;
  readonly #browserPageOperator: BrowserPageOperator;
  readonly #resumePublications: ResumePublicationGateway;
  readonly #experiences: ExperienceReader & ExperienceWriter;
  readonly #jds: JdReader & JdWriter;
  readonly #contexts = new Map<string, ConversationAgentContext>();
  #runningConversationId: string | undefined;

  public constructor(
    apiClient: CooltoApiClient,
    store: ConversationStore,
    resumeDrafts: ResumeDraftService,
    target: WebContents,
    resumeCompiler: ResumePdfCompiler,
    resumePdfExports: ResumePdfExportGateway,
    selectedFiles: ConversationSelectedFiles,
    browserPageReader: BrowserPageReader,
    browserPageOperator: BrowserPageOperator,
    resumePublications: ResumePublicationGateway,
    experiences: ExperienceReader & ExperienceWriter,
    jds: JdReader & JdWriter,
  ) {
    this.#apiClient = apiClient;
    this.#store = store;
    this.#resumeDrafts = resumeDrafts;
    this.#target = target;
    this.#resumeCompiler = resumeCompiler;
    this.#resumePdfExports = resumePdfExports;
    this.#selectedFiles = selectedFiles;
    this.#browserPageReader = browserPageReader;
    this.#browserPageOperator = browserPageOperator;
    this.#resumePublications = resumePublications;
    this.#experiences = experiences;
    this.#jds = jds;
  }

  public get isRunning(): boolean {
    return this.#runningConversationId !== undefined;
  }

  public async prompt(input: AgentPromptInput): Promise<ConversationDetail> {
    const conversationId = input.conversationId;
    const context = await this.#contextFor(conversationId);
    this.#assertCanRun(conversationId);
    this.#runningConversationId = conversationId;
    try {
      const editBase = input.resumeReference
        ? await this.#activateReferencedDraft(context, input.resumeReference.artifactId)
        : undefined;
      if (editBase) {
        context.activeEdit = {
          artifactId: editBase.artifactId,
          base: structuredClone(editBase.workspace),
          summary: `AI 修改：${input.resumeReference?.label ?? "简历内容"}`,
        };
      }
      await context.agent.prompt(
        input.resumeReference
          ? promptWithResumeReference(input.text, input.resumeReference)
          : input.text,
      );
      const proposed = context.workspaceStore.latest();
      if (
        editBase &&
        proposed &&
        proposed.revision !== editBase.workspace.revision
      ) {
        await this.#resumeDrafts.proposeChange({
          artifactId: editBase.artifactId,
          base: editBase.workspace,
          proposed,
          summary: context.activeEdit?.summary ?? "AI 修改简历内容",
        });
      }
      return await this.#store.saveMessages(
        conversationId,
        context.agent.getMessages(),
      );
    } finally {
      context.activeEdit = undefined;
      this.#runningConversationId = undefined;
    }
  }

  async #activateReferencedDraft(
    context: ConversationAgentContext,
    artifactId: string,
  ) {
    const draft = await this.#resumeDrafts.get(artifactId);
    context.workspaceStore.restore(draft.workspace);
    context.artifactIdByCandidate.set(
      draft.workspace.candidateId,
      draft.artifactId,
    );
    return draft;
  }

  public cancel(): void {
    if (this.#runningConversationId) {
      this.#contexts.get(this.#runningConversationId)?.agent.cancel();
    }
  }

  public async resolveApproval(
    conversationId: string,
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<ConversationDetail> {
    const context = await this.#contextFor(conversationId);
    this.#assertCanRun(conversationId);
    this.#runningConversationId = conversationId;
    try {
      const jdContinuation = prepareJdContinuation(
        context.agent,
        requestId,
        decision,
      );
      const writeAccessContinuation = prepareBrowserWriteAccessContinuation(
        context.agent,
        requestId,
        decision,
      );
      await context.agent.resolveApproval(requestId, decision);
      const savedJd = jdContinuation?.getSavedJd();
      if (savedJd) {
        this.#emitJdSaved(conversationId, requestId, savedJd.jdId);
        await context.agent.prompt(buildJdContinuationPrompt(savedJd));
      }
      const grantedReason = writeAccessContinuation?.getGrantedReason();
      if (grantedReason) {
        await context.agent.prompt(
          buildBrowserWriteAccessContinuationPrompt(grantedReason),
        );
      }
      return await this.#store.saveMessages(
        conversationId,
        context.agent.getMessages(),
      );
    } finally {
      this.#runningConversationId = undefined;
    }
  }

  async #contextFor(
    conversationId: string,
  ): Promise<ConversationAgentContext> {
    const existing = this.#contexts.get(conversationId);
    if (existing) {
      return existing;
    }
    const context = this.#createContext(conversationId);
    context.agent.replaceMessages(
      await this.#store.loadMessages(conversationId),
    );
    this.#contexts.set(conversationId, context);
    return context;
  }

  #assertCanRun(conversationId: string): void {
    if (
      this.#runningConversationId &&
      this.#runningConversationId !== conversationId
    ) {
      throw new Error("另一个对话正在回复，请等待完成或先停止");
    }
  }

  #createContext(conversationId: string): ConversationAgentContext {
    const config = readConfig();
    const selectedFiles = this.#selectedFiles.forConversation(conversationId);
    const proposalStore = new ExperienceImportProposalStore();
    const jdProposalStore = new JdProposalStore();
    const matchReportStore = new MatchReportStore();
    const approvalManager = createActionApprovalManager({
      experienceWriter: this.#experiences,
      importProposalStore: proposalStore,
      jdWriter: this.#jds,
      jdProposalStore,
      resumePublications: this.#resumePublications,
      resumePdfExports: this.#resumePdfExports,
      browserPageOperator: this.#browserPageOperator,
    });
    const resumeSourceSnapshotBuilder = new ResumeSourceSnapshotBuilder({
      currentUser: this.#apiClient,
      profile: this.#apiClient,
      jd: this.#jds,
      experience: this.#experiences,
    });
    const resumeWorkspaceStore = new ResumeWorkspaceStore();
    const resumeCandidatePreparer = new ResumeCandidatePreparer(
      resumeSourceSnapshotBuilder,
      this.#resumeCompiler,
      resumeWorkspaceStore,
    );
    const resumeCandidatePatcher = new ResumeCandidatePatcher(
      this.#resumeCompiler,
      resumeWorkspaceStore,
    );
    const resumeQualityEvaluator = new ResumeQualityEvaluator();
    const resumeCandidateReviewer = new ResumeCandidateReviewer(
      resumeQualityEvaluator,
      resumeWorkspaceStore,
    );
    const resumeAlternativeRepairer = new ResumeAlternativeRepairer(
      this.#resumeCompiler,
      resumeQualityEvaluator,
      resumeWorkspaceStore,
    );
    const resumeSaveProposalBuilder = new ResumeSaveProposalBuilder(
      resumeWorkspaceStore,
    );
    const resumePdfExportProposalBuilder = new ResumePdfExportProposalBuilder(
      new ResumePdfExportSourceResolver(
        resumeWorkspaceStore,
        this.#resumePublications,
      ),
      this.#resumeCompiler,
    );
    const agent = createCooltoAgent({
      apiKey: config.apiKey,
      modelId: config.modelId,
      approvalManager,
      tools: createToolRegistry({
        currentUserReader: this.#apiClient,
        userProfileReader: this.#apiClient,
        experienceReader: this.#experiences,
        jdReader: this.#jds,
        resumeReader: this.#resumePublications,
        resumeSourceSnapshotBuilder,
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
        browserPageReader: this.#browserPageReader,
        browserPageOperator: this.#browserPageOperator,
      }),
    });
    const emitMatchReport = createMatchEmitter(this.#target, matchReportStore);
    const context: ConversationAgentContext = {
      agent,
      workspaceStore: resumeWorkspaceStore,
      jdProposalStore,
      matchReportStore,
      artifactIdByCandidate: new Map(),
    };
    agent.subscribe(async (event) => {
      if (
        event.type === "tool.completed" &&
        isResumeWorkspaceTool(event.name) &&
        !event.isError
      ) {
        await this.#syncLatestWorkspace(conversationId, context);
      }
      if (
        event.type === "tool.completed" &&
        event.name === "prepare_jd_import" &&
        !event.isError
      ) {
        this.#emitJdProposal(conversationId, context);
      }
      if (
        event.type === "tool.completed" &&
        event.name === "prepare_match_analysis" &&
        !event.isError
      ) {
        emitMatchReport(conversationId);
      }
      if (this.#target.isDestroyed()) {
        return;
      }
      this.#target.send("agent:event", {
        conversationId,
        event: event as DesktopAgentEvent,
      });
    });
    return context;
  }

  async #syncLatestWorkspace(
    conversationId: string,
    context: ConversationAgentContext,
  ): Promise<void> {
    const workspace = context.workspaceStore.latest();
    if (!workspace) return;
    if (context.activeEdit) {
      const draft = await this.#resumeDrafts.proposeChange({
        artifactId: context.activeEdit.artifactId,
        base: context.activeEdit.base,
        proposed: workspace,
        summary: context.activeEdit.summary,
      });
      await this.#notifyDraftUpdated(conversationId, draft.artifactId);
      return;
    }
    const artifactId = context.artifactIdByCandidate.get(
      workspace.candidateId,
    );
    const synced = await this.#resumeDrafts.syncWorkspace({
      conversationId,
      workspace,
      ...(artifactId ? { artifactId } : {}),
    });
    context.artifactIdByCandidate.set(
      workspace.candidateId,
      synced.draft.artifactId,
    );
    const draft =
      synced.created && workspace.status === "ready_for_approval"
        ? await this.#resumeDrafts.ensureGeneratedCheckpoint(
            synced.draft.artifactId,
          )
        : synced.draft;
    await this.#store.addResumeArtifact(
      conversationId,
      this.#resumeDrafts.artifactReference(draft),
    );
    await this.#notifyDraftUpdated(conversationId, draft.artifactId);
  }

  #emitJdProposal(
    conversationId: string,
    context: ConversationAgentContext,
  ): void {
    const proposal = context.jdProposalStore.getActive();
    if (!proposal || this.#target.isDestroyed()) return;
    const pending = context.agent.getPendingApprovals();
    const jdApproval = pending.find((p) => p.actionType === "jd.save");
    if (!jdApproval) return;
    this.#target.send("agent:event", {
      conversationId,
      event: {
        type: "jd.proposal.created",
        data: {
          proposalId: proposal.id,
          approvalRequestId: jdApproval.id,
          title: proposal.title,
          company: proposal.company,
          targetRole: proposal.targetRole,
          requirements: proposal.requirements.map((r) => ({
            text: r.text,
            category: r.category,
            importance: r.importance,
          })),
          status: "pending",
          createdAt: jdApproval.createdAt,
        },
      } satisfies DesktopAgentEvent,
    });
  }

  #emitJdSaved(
    conversationId: string,
    approvalRequestId: string,
    jdId: string,
  ): void {
    if (this.#target.isDestroyed()) return;
    this.#target.send("agent:event", {
      conversationId,
      event: {
        type: "jd.saved",
        approvalRequestId,
        jdId,
      } satisfies DesktopAgentEvent,
    });
  }

  async #notifyDraftUpdated(
    conversationId: string,
    artifactId: string,
  ): Promise<void> {
    if (this.#target.isDestroyed()) return;
    this.#target.send("agent:event", {
      conversationId,
      event: {
        type: "resume.draft.updated",
        artifactId,
      } satisfies DesktopAgentEvent,
    });
  }
}

function isResumeWorkspaceTool(name: string): boolean {
  return [
    "prepare_resume_candidate",
    "patch_resume_candidate",
    "review_resume_candidate",
  ].includes(name);
}

function promptWithResumeReference(
  text: string,
  reference: NonNullable<AgentPromptInput["resumeReference"]>,
): string {
  return [
    text.trim(),
    "",
    "<resume_reference>",
    `artifact_id: ${reference.artifactId}`,
    `target_type: ${reference.targetType}`,
    `target_id: ${reference.targetId}`,
    `label: ${reference.label}`,
    "Use the restored ResumeWorkspace and stable target ID. Keep all unrelated content unchanged.",
    "</resume_reference>",
  ].join("\n");
}
