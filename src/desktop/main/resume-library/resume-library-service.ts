import { randomUUID } from "node:crypto";
import type { ResumeFull } from "../../../resume/types.js";
import type { LocalResumeDraft, ResumeDraftCheckpoint } from "../../../resume/draft/types.js";
import { appendDraftCheckpoint } from "../../../resume/draft/projection.js";
import { buildLibraryEntries, buildEntryFromFull } from "../../../resume/library/projection.js";
import type { ResumeLibraryEntry } from "../../../resume/library/types.js";
import type { ResumeLibraryApi } from "../../../api/resume-library-api.js";
import type { ResumeDraftFileRepository } from "../resume-drafts/draft-file-repository.js";
import type { ResumePublicationGateway } from "../../../resume/save/types.js";

export class ResumeLibraryService {
  public constructor(
    private readonly cloudApi: ResumePublicationGateway,
    private readonly libraryApi: ResumeLibraryApi,
    private readonly draftRepo: ResumeDraftFileRepository,
  ) {}

  public async list(signal?: AbortSignal): Promise<ResumeLibraryEntry[]> {
    const [clouds, drafts] = await Promise.all([
      this.cloudApi.listResumes(signal),
      this.draftRepo.list(),
    ]);
    return buildLibraryEntries(clouds, drafts.map(summarizeDraftForProjection));
  }

  public async rename(
    resumeId: string,
    title: string,
    signal?: AbortSignal,
  ): Promise<ResumeFull> {
    return this.libraryApi.rename(resumeId, title, signal);
  }

  public async archive(resumeId: string, signal?: AbortSignal): Promise<ResumeFull> {
    return this.libraryApi.archive(resumeId, signal);
  }

  public async unarchive(resumeId: string, signal?: AbortSignal): Promise<ResumeFull> {
    return this.libraryApi.unarchive(resumeId, signal);
  }

  public async deleteLocalDraft(artifactId: string): Promise<void> {
    await this.draftRepo.delete(artifactId);
  }

  public async getCheckpoints(artifactId: string): Promise<ResumeDraftCheckpoint[]> {
    const draft = await this.draftRepo.get(artifactId);
    return draft.checkpoints;
  }

  public async restoreCheckpoint(
    artifactId: string,
    checkpointId: string,
  ): Promise<LocalResumeDraft> {
    const draft = await this.draftRepo.get(artifactId);
    const checkpoint = draft.checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) throw new Error(`检查点 ${checkpointId} 不存在`);

    // Restore = apply checkpoint workspace as new working head, then add a checkpoint
    const restored: LocalResumeDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
      workspace: structuredClone(checkpoint.workspace),
      pendingChange: null,
    };
    const withCheckpoint = appendDraftCheckpoint(restored, "restored", `恢复：${checkpoint.label}`);
    await this.draftRepo.save(withCheckpoint);
    return withCheckpoint;
  }

  public async getEntry(
    resumeId: string | null,
    artifactId: string | null,
    signal?: AbortSignal,
  ): Promise<ResumeLibraryEntry> {
    const [cloud, draft] = await Promise.all([
      resumeId ? this.cloudApi.getResume(resumeId, signal) : Promise.resolve(null),
      artifactId ? this.draftRepo.get(artifactId) : Promise.resolve(null),
    ]);
    return buildEntryFromFull(cloud, draft);
  }
}

function summarizeDraftForProjection(draft: LocalResumeDraft) {
  const syncedRevision = draft.cloudLink?.syncedRevision;
  return {
    artifactId: draft.artifactId,
    title: draft.title,
    conversationIds: [...draft.conversationIds],
    updatedAt: draft.updatedAt,
    checkpointCount: draft.checkpoints.length,
    hasPendingChange: draft.pendingChange !== null,
    cloudState: (
      syncedRevision === undefined
        ? "local_only"
        : syncedRevision === draft.workspace.revision
          ? "synced"
          : "local_changes"
    ) as "local_only" | "synced" | "local_changes",
  };
}
