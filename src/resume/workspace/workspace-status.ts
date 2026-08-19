import type { ResumeCompileResult } from "../compiler-types.js";
import type { ResumeStructure } from "../types.js";
import {
  hasMinimumGeneratedContent,
  unwrittenExperienceItemIds,
} from "./candidate-content.js";
import { rankAvailableEvidence } from "../quality/evidence-candidates.js";
import type { ResumeWorkspace, ResumeWorkspaceStatus } from "./types.js";

type EvidenceState = Pick<ResumeWorkspace, "sourceSnapshot" | "bindings">;

/**
 * 补长天花板：把当前所有 bullet 都补长到单条最大行数后能达到的页面占用率。
 * 证据耗尽 ≠ 立即终态——模型还可以用已引用证据（事实等价的局部修复）把
 * bullet 补长来达标；只有"补长到顶也到不了最低占用率"才是数学上无路可走，
 * 才应立即交还用户。
 */
export function maxReachableUsageRatio(
  result: ResumeCompileResult,
  maxBulletLines: 2 | 3,
): number {
  const lineHeight = result.bodyLineHeightPx > 0 ? result.bodyLineHeightPx : 20;
  const usedHeightPx =
    result.usedHeightPx > 0
      ? result.usedHeightPx
      : result.usageRatio * Math.max(1, result.availableHeightPx);
  const lengthenablePx = result.bullets.reduce((total, bullet) => {
    const lines = bullet.lineCount ?? 1;
    return total + Math.max(0, maxBulletLines - lines) * lineHeight;
  }, 0);
  return (
    (usedHeightPx + lengthenablePx) / Math.max(1, result.availableHeightPx)
  );
}

export function deriveWorkspaceStatus(
  result: ResumeCompileResult,
  structure: ResumeStructure,
  evidenceState?: EvidenceState,
  maxBulletLines: 2 | 3 = 3,
): ResumeWorkspaceStatus {
  if (result.qualified && hasMinimumGeneratedContent(structure)) {
    return "layout_qualified";
  }
  const nonWritingViolations = result.violations.filter(
    (violation) => violation.code !== "page_underfilled",
  );
  const exhausted =
    evidenceState &&
    unwrittenExperienceItemIds(structure).length === 0 &&
    rankAvailableEvidence(
      evidenceState.sourceSnapshot,
      evidenceState.bindings,
    ).length === 0;
  // 素材耗尽 + 页面仍未达标（欠填或尾行违规等，不含溢出——溢出靠 trim 修复
  // 不需要新素材）时：只有"把所有 bullet 补长到单条最大行数也达不到最低占用率"
  // 才是无路可走，立即交还用户；补长可达标则继续写作循环（补长只用已引用
  // 证据，不需要未消费证据）。
  if (
    exhausted &&
    !result.qualified &&
    !result.violations.some((violation) => violation.code === "page_overflow") &&
    maxReachableUsageRatio(result, maxBulletLines) <
      result.effectiveTargetBand.minimum
  ) {
    return "needs_user_decision";
  }
  return nonWritingViolations.length ? "needs_revision" : "writing";
}
