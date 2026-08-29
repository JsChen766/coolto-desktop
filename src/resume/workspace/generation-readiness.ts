import type { ResumeWorkspace, ResumeWorkspaceStatus } from "./types.js";
import { deriveWorkspaceStatus } from "./workspace-status.js";
import { pendingAugmentedContent } from "./augmentation-state.js";
import { criticalSkillWarning } from "./critical-skill-gate.js";
import { supplementalIntegrationTargets } from
  "./supplemental-integration-targets.js";
import { itemReadinessBlockers } from "./item-readiness.js";
import type { ResumeGenerationBlocker, ResumeGenerationReadiness } from
  "./generation-readiness-types.js";
import { workUnitReadinessBlockers } from "./work-unit-ownership.js";
export type {
  ResumeGenerationBlocker,
  ResumeGenerationBlockerCode,
  ResumeGenerationReadiness,
} from "./generation-readiness-types.js";

/** Deterministic host gate shared by preview, save and export. */
export function resumeGenerationReadiness(
  workspace: ResumeWorkspace,
): ResumeGenerationReadiness {
  const blockers: ResumeGenerationBlocker[] = [];
  if (workspace.workUnitMap?.status === "pending") blockers.push({
    code: "work_unit_map_missing",
    message: "经历 evidence 尚未完成 WorkUnit 语义分组",
  });
  const criticalWarning = criticalSkillWarning(workspace);
  const warnings = criticalWarning ? [criticalWarning] : [];
  if (workspace.reuseAdaptation?.status === "pending") blockers.push({
    code: "reuse_adaptation_pending",
    message: "历史简历基底尚未完成针对当前 JD 的内容适配",
  });
  const supplementalTargets = supplementalIntegrationTargets(workspace);
  for (const target of supplementalTargets) {
    blockers.push({
      code: "supplemental_evidence_not_integrated",
      message: "用户本轮补充事实尚未写入该经历的正式简历内容",
      itemId: target.itemId,
    });
  }
  if (criticalWarning && !workspace.factNeutralAuthorization) {
    blockers.push(criticalWarning);
  }
  if (
    workspace.compileObservedRevision !== undefined &&
    workspace.compileObservedRevision !== workspace.revision
  ) {
    blockers.push({
      code: "layout_not_current",
      message: "当前修订尚未完成真实版面测量",
    });
  }
  if (!workspace.compileResult.qualified) {
    blockers.push({
      code: "layout_not_qualified",
      message: layoutFailureMessage(workspace),
    });
  }
  const visibleBulletIds = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets.map((bullet) => bullet.id)),
  );
  const measuredBulletIds = new Set(
    workspace.compileResult.bullets.map((bullet) => bullet.bulletId),
  );
  if (
    measuredBulletIds.size !== visibleBulletIds.length ||
    visibleBulletIds.some((id) => !measuredBulletIds.has(id))
  ) {
    blockers.push({
      code: "layout_not_current",
      message: "当前 bullet 与真实版面测量结果不一致",
    });
  }
  blockers.push(...workUnitReadinessBlockers(workspace));
  blockers.push(...itemReadinessBlockers(workspace));
  for (const pending of pendingAugmentedContent(workspace)) {
    if (pending.kind !== "fragment") continue;
    blockers.push({
      code: "augmented_confirmation_pending",
      message: "AI 补写片段尚未得到用户确认",
      itemId: pending.itemId,
      bulletId: pending.bulletId,
    });
  }
  return { ready: blockers.length === 0, blockers, warnings };
}

export function generationWorkspaceStatus(
  workspace: ResumeWorkspace,
): ResumeWorkspaceStatus {
  if (criticalSkillWarning(workspace) && !workspace.factNeutralAuthorization) {
    return "needs_user_decision";
  }
  if (workspace.reuseAdaptation?.status === "pending") return "writing";
  if (resumeGenerationReadiness(workspace).ready) return "ready_for_approval";
  return deriveWorkspaceStatus(
    workspace.compileResult,
    workspace.structure,
    { sourceSnapshot: workspace.sourceSnapshot, bindings: workspace.bindings },
  );
}

function layoutFailureMessage(workspace: ResumeWorkspace): string {
  const codes = workspace.compileResult.violations.map((item) => item.code);
  return codes.length
    ? `版面尚未达标：${codes.join("、")}`
    : "版面尚未达到单页、92% 页面占用率和 >70% 尾行要求";
}
