import { randomUUID } from "node:crypto";

import { ResumeWorkspaceError } from "../workspace/errors.js";
import { ResumeWorkspaceStore } from "../workspace/workspace-store.js";
import { toBrowserLayoutObservation } from "./layout-observation.js";
import type {
  ResumeSaveApprovalPayload,
  ResumeSaveMode,
} from "./types.js";

export interface BuildResumeSaveProposalInput {
  candidateId: string;
  expectedRevision: number;
  title: string;
  mode: ResumeSaveMode;
  resumeId?: string;
  expectedBaseVariantId?: string;
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
    if (
      workspace.status !== "ready_for_approval" ||
      !workspace.qualityReport?.passed ||
      !workspace.compileResult.qualified ||
      workspace.structure.quality_status !== "passed"
    ) {
      throw new ResumeWorkspaceError(
        "candidate_not_ready_for_save",
        "Only a source, quality, and layout-qualified candidate can be saved.",
      );
    }
    const bulletCount = workspace.structure.sections.reduce(
      (total, section) =>
        total + section.items.reduce((sum, item) => sum + item.bullets.length, 0),
      0,
    );
    if (bulletCount === 0 || bulletCount !== workspace.bindings.length) {
      throw new ResumeWorkspaceError(
        "candidate_evidence_incomplete",
        "Every persisted bullet must retain one evidence binding.",
      );
    }
    const title = input.title.trim();
    if (!title) throw new Error("简历标题不能为空");
    const versionTarget = resolveVersionTarget(input);
    const proposalId = `resume-save-${randomUUID()}`;
    const structured = structuredClone(workspace.structure);
    structured.layout_usage_ratio = workspace.compileResult.usageRatio;
    return {
      proposalId,
      mode: input.mode,
      candidateId: workspace.candidateId,
      candidateRevision: workspace.revision,
      title,
      targetRole: workspace.sourceSnapshot.jd.targetRole,
      jdId: workspace.sourceSnapshot.jd.id,
      ...versionTarget,
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

function resolveVersionTarget(input: BuildResumeSaveProposalInput) {
  if (input.mode === "new_resume") return {};
  const resumeId = input.resumeId?.trim();
  const expectedBaseVariantId = input.expectedBaseVariantId?.trim();
  if (!resumeId || !expectedBaseVariantId) {
    throw new Error("保存为新版本时必须指定 resumeId 和当前 active variant ID");
  }
  return { resumeId, expectedBaseVariantId };
}
