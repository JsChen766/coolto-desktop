import type { WebContents } from "electron";

import { createMatchEmitter } from "./match-emitter.js";
import type { DesktopAgentEvent } from "../shared/types.js";
import { ConversationStore } from "./conversation-store.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";
import { parseExperienceImportResult } from "../../import/result-artifact.js";
import { ResumeGenerationTraceStore } from "../../resume/performance/generation-trace-store.js";

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
        );
      }
      if (
        event.type === "tool.completed" &&
        isResumeWorkspaceTool(event.name) &&
        !event.isError
      ) {
        await this.syncLatestWorkspace(conversationId, context);
        this.emitTailFillActivity(conversationId, context);
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

  private async syncLatestWorkspace(
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

  private emitTailFillActivity(
    conversationId: string,
    context: ConversationAgentContext,
  ): void {
    const workspace = context.workspaceStore.latest();
    const tailFills =
      workspace?.lastOperationReport?.repairs.filter(
        (repair) => repair.kind === "tail_fill",
      ) ?? [];
    if (!tailFills.length || !workspace) return;
    const details = tailFills
      .map((repair) => `${repair.bulletId}+${repair.evidenceIds.length}`)
      .join(", ");
    this.emitHostFill(conversationId, [`尾行 ${details}`]);
  }

  public emitHostFill(
    conversationId: string,
    labels: readonly string[],
  ): void {
    if (!labels.length) return;
    const callId = `host-fill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.emit(conversationId, {
      type: "tool.started",
      callId,
      name: "host_fill",
      arguments: { label: `自动补充：${labels.join("；")}` },
    });
    this.emit(conversationId, {
      type: "tool.completed",
      callId,
      name: "host_fill",
      isError: false,
    });
  }

  private emit(conversationId: string, event: DesktopAgentEvent): void {
    if (!this.target.isDestroyed()) {
      this.target.send("agent:event", { conversationId, event });
    }
  }
}

function isResumeWorkspaceTool(name: string): boolean {
  return [
    "prepare_resume_candidate",
    "patch_resume_candidate",
    "review_resume_candidate",
  ].includes(name);
}
