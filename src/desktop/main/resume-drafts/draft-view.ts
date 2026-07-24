import type {
  ResumeDraftDetail,
  ResumeDraftQualityView,
} from "../../shared/types.js";
import { summarizeDraft } from "../../../resume/draft/projection.js";
import type { LocalResumeDraft } from "../../../resume/draft/types.js";
import type { ResumeWorkspace } from "../../../resume/workspace/types.js";

export function toResumeDraftDetail(
  draft: LocalResumeDraft,
): ResumeDraftDetail {
  return {
    ...summarizeDraft(draft),
    structure: structuredClone(draft.workspace.structure),
    compileResult: structuredClone(draft.workspace.compileResult),
    workspaceStatus: draft.workspace.status,
    quality: qualityView(draft.workspace),
    checkpoints: draft.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      label: checkpoint.label,
      reason: checkpoint.reason,
      createdAt: checkpoint.createdAt,
      revision: checkpoint.workspace.revision,
    })),
    pendingChange: draft.pendingChange
      ? {
          id: draft.pendingChange.id,
          summary: draft.pendingChange.summary,
          changedBulletIds: [...draft.pendingChange.changedBulletIds],
          createdAt: draft.pendingChange.createdAt,
        }
      : null,
  };
}

function qualityView(workspace: ResumeWorkspace): ResumeDraftQualityView {
  const tails = workspace.compileResult.bullets.map(
    (bullet) => bullet.lastLineRatio,
  );
  const requirementIds = new Set(
    workspace.sourceSnapshot.jd.requirements.map(
      (requirement) => requirement.id,
    ),
  );
  const covered = new Set(
    workspace.bindings
      .flatMap((binding) => [...binding.matchedRequirementIds])
      .filter((id) => requirementIds.has(id)),
  );
  return {
    pageUsageRatio: workspace.compileResult.usageRatio,
    minimumBulletTailRatio: tails.length ? Math.min(...tails) : null,
    factIntegrity:
      workspace.qualityReport?.passed &&
      workspace.structure.quality_status === "passed"
        ? "passed"
        : workspace.qualityReport?.blocking
          ? "failed"
          : "needs_review",
    jdCoverage: requirementIds.size
      ? {
          covered: covered.size,
          total: requirementIds.size,
          ratio: covered.size / requirementIds.size,
        }
      : null,
  };
}
