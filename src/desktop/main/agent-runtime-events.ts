import type { WebContents } from "electron";

import { createMatchEmitter } from "./match-emitter.js";
import type { DesktopAgentEvent } from "../shared/types.js";
import { ConversationStore } from "./conversation-store.js";
import { ResumeDraftService } from "./resume-drafts/resume-draft-service.js";
import type { ConversationAgentContext } from "./agent-runtime-context.js";

export class AgentRuntimeEvents {
  public constructor(
    private readonly target: WebContents,
    private readonly store: ConversationStore,
    private readonly resumeDrafts: ResumeDraftService,
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
      if (
        event.type === "tool.completed" &&
        isResumeWorkspaceTool(event.name) &&
        !event.isError
      ) {
        await this.syncLatestWorkspace(conversationId, context);
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
