import type { ResumePublicationGateway } from "../save/types.js";
import type { ResumeWorkspaceStore } from "../workspace/workspace-store.js";
import { ResumePdfExportError } from "./errors.js";
import type {
  ResolvedResumePdfSource,
  ResumePdfExportSourceInput,
} from "./types.js";

export class ResumePdfExportSourceResolver {
  public constructor(
    private readonly workspaces: ResumeWorkspaceStore,
    private readonly resumes: ResumePublicationGateway,
  ) {}

  public async resolve(
    input: ResumePdfExportSourceInput,
    signal?: AbortSignal,
  ): Promise<ResolvedResumePdfSource> {
    return input.source === "candidate"
      ? this.resolveCandidate(input)
      : this.resolvePublished(input, signal);
  }

  private resolveCandidate(
    input: Extract<ResumePdfExportSourceInput, { source: "candidate" }>,
  ): ResolvedResumePdfSource {
    const workspace = this.workspaces.get(input.candidateId);
    if (
      workspace.revision !== input.expectedRevision ||
      workspace.status !== "ready_for_approval" ||
      !workspace.qualityReport?.passed ||
      workspace.structure.quality_status !== "passed" ||
      !workspace.compileResult.qualified
    ) {
      throw new ResumePdfExportError(
        "candidate_not_exportable",
        "Only the current ready_for_approval candidate can be exported.",
      );
    }
    const title = requiredTitle(input.title);
    return {
      source: "candidate",
      title,
      candidateId: workspace.candidateId,
      candidateRevision: workspace.revision,
      structure: structuredClone(workspace.structure),
    };
  }

  private async resolvePublished(
    input: Extract<ResumePdfExportSourceInput, { source: "published" }>,
    signal?: AbortSignal,
  ): Promise<ResolvedResumePdfSource> {
    const resumeId = input.resumeId.trim();
    if (!resumeId) throw publishedError("resumeId is required");
    const resume = await this.resumes.getResume(resumeId, signal);
    if (
      resume.status !== "published" ||
      resume.qualityStatus !== "passed"
    ) {
      throw publishedError("Resume is not a published and quality-passed document");
    }
    return {
      source: "published",
      title: requiredTitle(input.title ?? resume.title),
      resumeId: resume.id,
      contentHash: resume.contentHash,
      structure: structuredClone(resume.structured),
    };
  }
}

function requiredTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error("PDF title is required");
  return title;
}

function publishedError(message: string): ResumePdfExportError {
  return new ResumePdfExportError("published_resume_not_exportable", message);
}
