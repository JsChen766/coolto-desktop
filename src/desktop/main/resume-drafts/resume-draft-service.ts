import type { ResumeWorkspace } from "../../../resume/workspace/types.js";
import { randomUUID } from "node:crypto";
import {
  appendDraftCheckpoint,
  createLocalResumeDraft,
  summarizeDraft,
  updateDraftWorkspace,
} from "../../../resume/draft/projection.js";
import type {
  LocalResumeDraft,
  ResumeDraftArtifactReference,
  ResumeDraftCheckpointReason,
  ResumeDraftSummary,
} from "../../../resume/draft/types.js";
import { ResumeDraftFileRepository } from "./draft-file-repository.js";

export class ResumeDraftService {
  public constructor(
    private readonly ownerId: string,
    private readonly repository: ResumeDraftFileRepository,
  ) {}

  public async list(): Promise<ResumeDraftSummary[]> {
    return (await this.repository.list()).map(summarizeDraft);
  }

  public get(artifactId: string): Promise<LocalResumeDraft> {
    return this.repository.get(artifactId);
  }

  public async save(draft: LocalResumeDraft): Promise<void> {
    await this.repository.save(draft);
  }

  public async syncWorkspace(input: {
    conversationId: string;
    workspace: ResumeWorkspace;
    artifactId?: string;
  }): Promise<{ draft: LocalResumeDraft; created: boolean }> {
    const existing = input.artifactId
      ? await this.repository.get(input.artifactId)
      : (await this.repository.list()).find(
          (draft) =>
            draft.workspace.candidateId === input.workspace.candidateId,
        );
    const draft = existing
      ? updateDraftWorkspace(
          existing,
          input.conversationId,
          input.workspace,
        )
      : createLocalResumeDraft({
          ownerId: this.ownerId,
          conversationId: input.conversationId,
          workspace: input.workspace,
        });
    await this.repository.save(draft);
    return { draft, created: !existing };
  }

  public async ensureGeneratedCheckpoint(
    artifactId: string,
  ): Promise<LocalResumeDraft> {
    const current = await this.repository.get(artifactId);
    const latest = current.checkpoints.at(-1);
    if (
      latest?.reason === "generated" &&
      latest.workspace.revision === current.workspace.revision
    ) {
      return current;
    }
    return this.checkpoint(artifactId, "generated", "完成生成");
  }

  public async checkpoint(
    artifactId: string,
    reason: ResumeDraftCheckpointReason,
    label: string,
  ): Promise<LocalResumeDraft> {
    const draft = appendDraftCheckpoint(
      await this.repository.get(artifactId),
      reason,
      label,
    );
    await this.repository.save(draft);
    return draft;
  }

  public async proposeChange(input: {
    artifactId: string;
    base: ResumeWorkspace;
    proposed: ResumeWorkspace;
    summary: string;
  }): Promise<LocalResumeDraft> {
    const draft = await this.repository.get(input.artifactId);
    const changedBulletIds = changedBullets(input.base, input.proposed);
    if (!workspaceContentChanged(input.base, input.proposed)) return draft;
    const updated: LocalResumeDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
      workspace: structuredClone(input.proposed),
      pendingChange: {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        summary: input.summary.trim() || "AI 修改简历内容",
        changedBulletIds,
        base: structuredClone(input.base),
        proposed: structuredClone(input.proposed),
      },
    };
    await this.repository.save(updated);
    return updated;
  }

  public async acceptPendingChange(
    artifactId: string,
  ): Promise<LocalResumeDraft> {
    const draft = await this.repository.get(artifactId);
    if (!draft.pendingChange) throw new Error("当前没有待接受的 AI 修改");
    const accepted: LocalResumeDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
      workspace: structuredClone(draft.pendingChange.proposed),
      pendingChange: null,
    };
    await this.repository.save(accepted);
    return this.checkpoint(
      artifactId,
      "ai_change_accepted",
      "接受 AI 修改",
    );
  }

  public async rejectPendingChange(
    artifactId: string,
  ): Promise<LocalResumeDraft> {
    const draft = await this.repository.get(artifactId);
    if (!draft.pendingChange) throw new Error("当前没有待拒绝的 AI 修改");
    const rejected: LocalResumeDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
      workspace: structuredClone(draft.pendingChange.base),
      pendingChange: null,
    };
    await this.repository.save(rejected);
    return rejected;
  }

  public artifactReference(draft: LocalResumeDraft): ResumeDraftArtifactReference {
    const checkpoint = draft.checkpoints.at(-1);
    return {
      artifactId: draft.artifactId,
      checkpointId: checkpoint?.id ?? null,
      title: draft.title,
      createdAt: draft.createdAt,
    };
  }

  public async clearAll(): Promise<void> {
    await this.repository.clearAll();
  }
}

function workspaceContentChanged(
  base: ResumeWorkspace,
  proposed: ResumeWorkspace,
): boolean {
  return (
    JSON.stringify(base.structure) !== JSON.stringify(proposed.structure) ||
    JSON.stringify(base.bindings) !== JSON.stringify(proposed.bindings)
  );
}

function changedBullets(
  base: ResumeWorkspace,
  proposed: ResumeWorkspace,
): string[] {
  const before = new Map(
    base.structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.bullets.map((bullet) => [bullet.id, bullet.text] as const),
      ),
    ),
  );
  return proposed.structure.sections
    .flatMap((section) => section.items)
    .flatMap((item) => item.bullets)
    .filter((bullet) => before.get(bullet.id) !== bullet.text)
    .map((bullet) => bullet.id);
}
