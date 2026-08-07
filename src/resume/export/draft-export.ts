import { randomUUID } from "node:crypto";

import type { LocalResumeDraft } from "../draft/types.js";
import { sha256, stableStringify } from "../stable-snapshot.js";
import { ResumePdfExportError } from "./errors.js";
import { resumePdfFilename } from "./filename.js";
import type { ResumePdfExportApprovalPayload } from "./types.js";

export interface ResumeDraftPdfExportInput {
  draft: LocalResumeDraft;
  expectedRevision: number;
}

/**
 * Builds the immutable PDF export payload for the current qualified preview.
 * Re-reads the same draft on the main side and rejects stale revisions,
 * unmerged AI changes and versions that fail any compile/quality gate.
 */
export function buildDraftPdfExportPayload(
  input: ResumeDraftPdfExportInput,
): ResumePdfExportApprovalPayload {
  const { draft, expectedRevision } = input;
  const workspace = draft.workspace;
  if (workspace.revision !== expectedRevision) {
    throw new ResumePdfExportError(
      "stale_candidate_revision",
      `简历已变化到修订 ${workspace.revision}，请重新打开预览后再导出。`,
    );
  }
  if (draft.pendingChange) {
    throw new ResumePdfExportError(
      "draft_has_pending_change",
      "存在未合并的 AI 修改，请先接受或拒绝后再导出。",
    );
  }
  if (!isExportableWorkspace(workspace)) {
    throw new ResumePdfExportError(
      "candidate_not_exportable",
      "只有当前合格（ready_for_approval）的简历版本可以导出。",
    );
  }
  const structure = structuredClone(workspace.structure);
  return {
    proposalId: `resume-pdf-${randomUUID()}`,
    source: "candidate",
    title: draft.title,
    candidateId: workspace.candidateId,
    candidateRevision: workspace.revision,
    suggestedFilename: resumePdfFilename(draft.title),
    structureHash: sha256(stableStringify(structure)),
    structure,
    compileResult: structuredClone(workspace.compileResult),
  };
}

export function isExportableWorkspace(
  workspace: LocalResumeDraft["workspace"],
): boolean {
  return (
    workspace.status === "ready_for_approval" &&
    workspace.qualityReport?.passed === true &&
    workspace.structure.quality_status === "passed" &&
    workspace.compileResult.qualified === true
  );
}
