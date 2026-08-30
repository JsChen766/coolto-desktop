import type { ResumeFull } from "../../../resume/types.js";
import type { CloudResumePreview } from "../../shared/types.js";
import type { LocalResumeDraft, ResumeDraftCheckpoint } from "../../../resume/draft/types.js";
import {
  appendDraftCheckpoint,
  summarizeDraft,
} from "../../../resume/draft/projection.js";
import { buildLibraryEntries, buildEntryFromFull } from "../../../resume/library/projection.js";
import type { ResumeLibraryEntry } from "../../../resume/library/types.js";
import type { ResumeDraftFileRepository } from "../resume-drafts/draft-file-repository.js";
import type { ResumeSyncStore } from "./resume-sync-store.js";

export class ResumeLibraryService {
  public constructor(
	private readonly resumes: ResumeSyncStore,
    private readonly draftRepo: ResumeDraftFileRepository,
  ) {}

  public async list(signal?: AbortSignal): Promise<ResumeLibraryEntry[]> {
    const [clouds, drafts] = await Promise.all([
	  this.resumes.listResumes(signal),
      this.draftRepo.list(),
    ]);
	const entries = buildLibraryEntries(clouds, drafts.map(summarizeDraft));
	return entries.map((entry) => {
		const resumeId = entry.cloud?.resumeId;
		return resumeId && this.resumes.syncStatus(resumeId) === "conflict"
			? { ...entry, syncStatus: "conflict" as const }
			: entry;
	});
  }

  public async preview(
    resumeId: string,
    signal?: AbortSignal,
  ): Promise<CloudResumePreview> {
    const resume = await this.resumes.getResume(resumeId, signal);
    return {
      resumeId: resume.id,
      title: resume.title,
      contentHash: resume.contentHash,
      updatedAt: resume.updatedAt,
      structure: structuredClone(resume.structured),
    };
  }

  public async rename(
    resumeId: string,
    title: string,
    signal?: AbortSignal,
  ): Promise<ResumeFull> {
	return this.resumes.rename(resumeId, title);
  }

  public async archive(resumeId: string, signal?: AbortSignal): Promise<ResumeFull> {
	return this.resumes.setStatus(resumeId, "archived");
  }

  public async unarchive(resumeId: string, signal?: AbortSignal): Promise<ResumeFull> {
	return this.resumes.setStatus(resumeId, "active");
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
	  resumeId ? this.resumes.getResume(resumeId, signal) : Promise.resolve(null),
      artifactId ? this.draftRepo.get(artifactId) : Promise.resolve(null),
    ]);
    return buildEntryFromFull(cloud, draft);
  }
}
