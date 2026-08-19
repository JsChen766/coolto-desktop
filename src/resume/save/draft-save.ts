import { randomUUID } from "node:crypto";

import type { LocalResumeDraft } from "../draft/types.js";
import { resumeGenerationReadiness } from "../workspace/generation-readiness.js";
import { ResumeWorkspaceError } from "../workspace/errors.js";
import { toBrowserLayoutObservation } from "./layout-observation.js";
import type { ResumeSaveApprovalPayload } from "./types.js";

export function buildDraftSavePayload(input: {
  draft: LocalResumeDraft;
  expectedRevision: number;
}): ResumeSaveApprovalPayload {
  const { draft, expectedRevision } = input;
  const workspace = draft.workspace;
  if (workspace.revision !== expectedRevision) {
    throw new ResumeWorkspaceError(
      "stale_candidate_revision",
      `简历已变化到修订 ${workspace.revision}，请重新打开预览后再保存`,
    );
  }
  if (draft.pendingChange) {
    throw new ResumeWorkspaceError(
      "candidate_not_ready_for_save",
      "存在未合并的 AI 修改，请先接受或拒绝后再保存",
    );
  }
  const readiness = resumeGenerationReadiness(workspace);
  if (!readiness.ready) {
    throw new ResumeWorkspaceError(
      "candidate_not_ready_for_save",
      `当前简历尚不能保存：${readiness.blockers.map((item) => item.message).join("；")}`,
    );
  }
  const proposalId = `resume-host-save-${randomUUID()}`;
  const structured = structuredClone(workspace.structure);
  structured.layout_usage_ratio = workspace.compileResult.usageRatio;
  structured.quality_status = "passed";
  structured.quality_issues = [];
  const cloud = draft.cloudLink;
  return {
    proposalId,
    mode: cloud ? "replace_resume" : "new_resume",
    candidateId: workspace.candidateId,
    candidateRevision: workspace.revision,
    title: draft.title,
    targetRole: workspace.sourceSnapshot.jd.targetRole,
    jdId: workspace.sourceSnapshot.jd.id,
    ...(cloud
      ? { resumeId: cloud.resumeId, expectedContentHash: cloud.contentHash }
      : {}),
    sourceFingerprint: workspace.sourceSnapshot.sourceFingerprint,
    structured,
    evidenceBindings: structuredClone(workspace.bindings),
    observation: toBrowserLayoutObservation(workspace.compileResult, proposalId),
  };
}
