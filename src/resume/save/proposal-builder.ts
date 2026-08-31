import { randomUUID } from "node:crypto";

import { ResumeWorkspaceError } from "../workspace/errors.js";
import { ResumeWorkspaceStore } from "../workspace/workspace-store.js";
import { toBrowserLayoutObservation } from "./layout-observation.js";
import type {
  ResumeSaveApprovalPayload,
  ResumeSaveMode,
} from "./types.js";
import { resumeGenerationReadiness } from "../workspace/generation-readiness.js";
import { resumeSourceJd } from "../source-strategy.js";

export interface BuildResumeSaveProposalInput {
  candidateId: string;
  expectedRevision: number;
  title: string;
  mode: ResumeSaveMode;
  resumeId?: string;
  expectedContentHash?: string;
}

export class ResumeSaveProposalBuilder {
  public constructor(private readonly store: ResumeWorkspaceStore) {}

  public build(input: BuildResumeSaveProposalInput): ResumeSaveApprovalPayload {
    const workspace = this.store.get(input.candidateId);
    if (workspace.revision !== input.expectedRevision) {
      throw new ResumeWorkspaceError(
        "stale_candidate_revision",
        `Candidate revision changed from ${input.expectedRevision} to ${workspace.revision}.`,
      );
    }
    const readiness = resumeGenerationReadiness(workspace);
    if (!readiness.ready) {
      throw new ResumeWorkspaceError(
        "candidate_not_ready_for_save",
        `Candidate is not ready for save: ${readiness.blockers.map((item) => item.message).join("; ")}`,
      );
    }
    const bulletCount = workspace.structure.sections.reduce(
      (total, section) =>
        total + section.items.reduce((sum, item) => sum + item.bullets.length, 0),
      0,
    );
    const supplementalEvidenceIds = new Set(
      (workspace.supplementalEvidence ?? []).map((entry) => entry.evidenceId),
    );
    const groundedCount = workspace.bulletProvenance
      ? workspace.bulletProvenance.filter(
          (entry) => entry.origin === "grounded" && entry.evidenceIds.some(
            (evidenceId) => !supplementalEvidenceIds.has(evidenceId),
          ),
        ).length
      : bulletCount;
    if (bulletCount === 0 || groundedCount !== workspace.bindings.length) {
      throw new ResumeWorkspaceError(
        "candidate_evidence_incomplete",
        "Every source-backed bullet must retain one evidence binding.",
      );
    }
    const title = input.title.trim();
    if (!title) throw new Error("简历标题不能为空");
    const cloudTarget = resolveCloudTarget(input);
    const proposalId = `resume-save-${randomUUID()}`;
    const structured = structuredClone(workspace.structure);
    structured.layout_usage_ratio = workspace.compileResult.usageRatio;
    const jd = resumeSourceJd(workspace.sourceSnapshot);
    return {
      proposalId,
      mode: input.mode,
      candidateId: workspace.candidateId,
      candidateRevision: workspace.revision,
      title,
      targetRole: jd?.targetRole ?? null,
      jdId: jd?.id ?? null,
      ...cloudTarget,
      sourceFingerprint: workspace.sourceSnapshot.sourceFingerprint,
      structured,
      evidenceBindings: structuredClone(workspace.bindings),
      observation: toBrowserLayoutObservation(
        workspace.compileResult,
        proposalId,
      ),
    };
  }
}

function resolveCloudTarget(input: BuildResumeSaveProposalInput) {
  if (input.mode === "new_resume") return {};
  const resumeId = input.resumeId?.trim();
  const expectedContentHash = input.expectedContentHash?.trim();
  if (!resumeId || !expectedContentHash) {
    throw new Error("覆盖云端简历时必须指定 resumeId 和当前 contentHash");
  }
  return { resumeId, expectedContentHash };
}
