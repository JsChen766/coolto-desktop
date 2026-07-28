import type { ResumeFull } from "../../../resume/types.js";
import type { ResumeDraftFileRepository } from "../resume-drafts/draft-file-repository.js";

/** Maintains the explicit association between a local draft and cloud Resume. */
export class ResumeDraftCloudLinker {
  public constructor(private readonly drafts: ResumeDraftFileRepository) {}

  public async link(candidateId: string, resume: ResumeFull): Promise<void> {
    const draft = (await this.drafts.list()).find(
      (item) => item.workspace.candidateId === candidateId,
    );
    if (!draft) return;
    const now = new Date().toISOString();
    await this.drafts.save({
      ...draft,
      updatedAt: now,
      cloudLink: {
        resumeId: resume.id,
        contentHash: resume.contentHash,
        syncedAt: now,
        syncedRevision: draft.workspace.revision,
        entityVersion: resume.entityVersion,
      },
    });
  }
}
