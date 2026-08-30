import type {
  ResumeDraftDetail,
  ResumeDraftQualityView,
} from "../../shared/types.js";
import { resumeSourceRequirements } from "../../../resume/source-strategy.js";
import { summarizeDraft } from "../../../resume/draft/projection.js";
import type { LocalResumeDraft } from "../../../resume/draft/types.js";
import type { ResumeBulletMeasurement } from "../../../resume/compiler-types.js";
import { resolveTailPolicy } from "../../../resume/tail-policy.js";
import type { ResumeWorkspace } from "../../../resume/workspace/types.js";
import { resumeGenerationReadiness } from "../../../resume/workspace/generation-readiness.js";

export function toResumeDraftDetail(
  draft: LocalResumeDraft,
): ResumeDraftDetail {
  return {
    ...summarizeDraft(draft),
    revision: draft.workspace.revision,
    structure: structuredClone(draft.workspace.structure),
    compileResult: structuredClone(draft.workspace.compileResult),
    workspaceStatus: draft.workspace.status,
    quality: qualityView(draft.workspace),
    generationReadiness: resumeGenerationReadiness(draft.workspace),
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
  const minimumTail = workspace.compileResult.bullets.reduce<
    ResumeBulletMeasurement | undefined
  >((current, bullet) => !current || bullet.lastLineRatio < current.lastLineRatio
    ? bullet : current, undefined);
  const requirementIds = new Set(
    resumeSourceRequirements(workspace.sourceSnapshot).map(
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
    minimumBulletTailRatio: minimumTail?.lastLineRatio ?? null,
    minimumBulletTailTargetRatio: minimumTail
      ? resolveTailPolicy(minimumTail.tailPolicyVersion).hardMinRatio
      : null,
    factIntegrity: factIntegrity(workspace),
    jdCoverage: requirementIds.size
      ? {
          covered: covered.size,
          total: requirementIds.size,
          ratio: covered.size / requirementIds.size,
        }
      : null,
  };
}

function factIntegrity(
  workspace: ResumeWorkspace,
): ResumeDraftQualityView["factIntegrity"] {
  const readiness = resumeGenerationReadiness(workspace);
  if (readiness.blockers.some((item) =>
    ["bullet_provenance_missing", "grounded_evidence_missing"].includes(item.code)
  )) return "failed";
  return readiness.blockers.some((item) =>
    item.code === "augmented_confirmation_pending"
  ) ? "needs_review" : "passed";
}
