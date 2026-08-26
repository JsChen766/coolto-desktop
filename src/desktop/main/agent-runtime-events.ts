import type { WebContents } from "electron";

import { createMatchEmitter } from "./match-emitter.js";
import type { DesktopAgentEvent } from "../shared/types.js";
import { ConversationStore } from "./conversation-store.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { parseExperienceImportResult } from "../../import/result-artifact.js";
import { ResumeGenerationTraceStore } from "../../resume/performance/generation-trace-store.js";
import { extractInsufficientCreditsDetail } from "./insufficient-credits-detect.js";
import { traceStopReason, traceToolMetadata } from "./agent-runtime-trace.js";
import { shouldPublishResumeWorkspace } from
  "./resume-drafts/draft-publication.js";

export class AgentRuntimeEvents {
  public constructor(
    private readonly target: WebContents,
    private readonly store: ConversationStore,
    private readonly resumeDrafts: ResumeDraftService,
    private readonly traces: ResumeGenerationTraceStore,
  ) {}

  public subscribe(
    conversationId: string,
    context: ConversationAgentContext,
  ): void {
    const emitMatchReport = createMatchEmitter(
      this.target,
      context.matchReportStore,
    );
    context.agent.subscribe(async (event) => {
      if (event.type === "model.started") {
        this.traces.recordModelStarted(conversationId);
        return;
      }
      if (event.type === "model.completed") {
        this.traces.recordModelCompleted(
          conversationId,
          event.isError ? "error" : "success",
          event.usage,
        );
        return;
      }
      if (event.type === "run.failed") {
        this.traces.recordModelCompleted(conversationId, "error");
        this.traces.recordStopReason(
          conversationId,
          traceStopReason(event.message, event.governorStopReason),
        );
        // A gateway insufficient_credits rejection surfaces here as a folded
        // error string; forward the structured balance breakdown so the
        // renderer can open the purchase dialog.
        const detail = extractInsufficientCreditsDetail(event.message);
        if (detail && !this.target.isDestroyed()) {
          this.target.send("agent:event", {
            conversationId,
            event: { type: "agent.insufficient-credits", detail },
          });
        }
      }
      if (event.type === "tool.started") {
        this.traces.recordToolStarted(conversationId, event.callId, event.name);
      }
      if (event.type === "tool.completed") {
        this.traces.recordTool(
          conversationId,
          event.callId,
          event.name,
          event.isError ? "error" : "success",
          traceToolMetadata(event.progress, event.error),
        );
      }
      if (
        event.type === "tool.completed" &&
        isResumeWorkspaceTool(event.name) &&
        !event.isError &&
        shouldPublishLatestWorkspace(context)
      ) {
        this.emit(conversationId, { type: "resume.draft.saving" });
        try {
          await this.syncLatestWorkspace(conversationId, context);
        } catch (error: unknown) {
          this.emit(conversationId, {
            type: "resume.draft.save-failed",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (
        event.type === "tool.completed" &&
        event.name === "prepare_jd_import" &&
        !event.isError
      ) {
        this.emitJdProposal(conversationId, context);
      }
      if (
        event.type === "tool.completed" &&
        event.name === "prepare_match_analysis" &&
        !event.isError
      ) {
        emitMatchReport(conversationId);
      }
      if (event.type === "approval.completed") {
        const result = parseExperienceImportResult(event.details);
        if (result) {
          await this.store.addExperienceImportResult(conversationId, result);
        }
      }
      if (!this.target.isDestroyed()) {
        this.target.send("agent:event", {
          conversationId,
          event: event as DesktopAgentEvent,
        });
      }
    });
  }

  public emitJdSaved(
    conversationId: string,
    approvalRequestId: string,
    jdId: string,
  ): void {
    this.emit(conversationId, {
      type: "jd.saved",
      approvalRequestId,
      jdId,
    });
  }

  public async syncLatestWorkspace(
    conversationId: string,
    context: ConversationAgentContext,
  ): Promise<void> {
    const workspace = context.workspaceStore.latest();
    if (!workspace) return;
    if (context.activeEdit) {
      const draft = await this.resumeDrafts.proposeChange({
        artifactId: context.activeEdit.artifactId,
        base: context.activeEdit.base,
        proposed: workspace,
        summary: context.activeEdit.summary,
      });
      this.notifyDraftUpdated(conversationId, draft.artifactId);
      this.traces.recordDraftSaved(conversationId);
      if (workspace.status === "ready_for_approval") {
        this.traces.recordQualifiedPreviewDelivered(conversationId);
      }
      return;
    }
    const artifactId = context.artifactIdByCandidate.get(workspace.candidateId);
    const synced = await this.resumeDrafts.syncWorkspace({
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
        ? await this.resumeDrafts.ensureGeneratedCheckpoint(
            synced.draft.artifactId,
          )
        : synced.draft;
    await this.store.addResumeArtifact(
      conversationId,
      this.resumeDrafts.artifactReference(draft),
    );
    this.notifyDraftUpdated(conversationId, draft.artifactId);
    this.traces.recordDraftSaved(conversationId);
    if (workspace.status === "ready_for_approval") {
      this.traces.recordQualifiedPreviewDelivered(conversationId);
    }
  }

  private emitJdProposal(
    conversationId: string,
    context: ConversationAgentContext,
  ): void {
    const proposal = context.jdProposalStore.getActive();
    if (!proposal) return;
    const approval = context.agent
      .getPendingApprovals()
      .find((item) => item.actionType === "jd.save");
    if (!approval) return;
    this.emit(conversationId, {
      type: "jd.proposal.created",
      data: {
        proposalId: proposal.id,
        approvalRequestId: approval.id,
        title: proposal.title,
        company: proposal.company,
        targetRole: proposal.targetRole,
        sourceKind: proposal.sourceKind,
        sourceUrl: proposal.sourceUrl,
        requirements: proposal.requirements.map((requirement) => ({
          text: requirement.text,
          category: requirement.category,
          importance: requirement.importance,
        })),
        status: "pending",
        createdAt: approval.createdAt,
      },
    });
  }

  private notifyDraftUpdated(
    conversationId: string,
    artifactId: string,
  ): void {
    this.emit(conversationId, {
      type: "resume.draft.updated",
      artifactId,
    });
  }

  private emit(conversationId: string, event: DesktopAgentEvent): void {
    if (!this.target.isDestroyed()) {
      this.target.send("agent:event", { conversationId, event });
    }
  }
}

function shouldPublishLatestWorkspace(
  context: ConversationAgentContext,
): boolean {
  const workspace = context.workspaceStore.latest();
  return shouldPublishResumeWorkspace(
    workspace,
    workspace
      ? context.artifactIdByCandidate.has(workspace.candidateId)
      : false,
  );
}

function isResumeWorkspaceTool(name: string): boolean {
  return [
    "create_resume_workspace",
    "apply_resume_content",
    "add_resume_material",
    "pause_resume_for_material",
    "decline_resume_material",
  ].includes(name);
}
