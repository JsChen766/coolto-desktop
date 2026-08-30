import type { ResumeCompileViolation } from "../compiler-types.js";
import type { ResumeStructure } from "../types.js";
import { calculateResumeBudget } from "./candidate-budget.js";
import { unwrittenExperienceItemIds } from "./candidate-content.js";
import { rankAvailableEvidence } from "../quality/evidence-candidates.js";
import { maxReachableUsageRatio } from "./workspace-status.js";
import type { ResumeWorkspace } from "./types.js";
import { resolveTailPolicy } from "../tail-policy.js";

export function bulletTailDiagnostics(
  workspace: Pick<ResumeWorkspace, "compileResult" | "structure">,
): object[] {
  const byId = new Map(
    workspace.compileResult.bullets.map((measurement) => [
      measurement.bulletId,
      measurement,
    ]),
  );
  const charsPerUnit = characterFactor(
    workspace.compileResult.bodyFontSizePx,
    workspace.structure.language,
  );
  return workspace.compileResult.violations
    .filter(
      (violation): violation is ResumeCompileViolation & { bulletId: string } =>
        violation.code === "bullet_tail_too_short" && Boolean(violation.bulletId),
    )
    .map((violation) => {
      const measurement = byId.get(violation.bulletId);
      const policy = resolveTailPolicy(measurement?.tailPolicyVersion);
      const requiredWidthPx =
        (measurement?.availableLineWidthPx ?? 0) * policy.hardMinRatio;
      const deficitPx = Math.max(
        0,
        requiredWidthPx - (measurement?.lastLineWidthPx ?? 0),
      );
      return {
        bulletId: violation.bulletId,
        lineCount: measurement?.lineCount ?? 0,
        lastLineWidthPx: measurement?.lastLineWidthPx ?? 0,
        availableLineWidthPx: measurement?.availableLineWidthPx ?? 0,
        requiredWidthPx: round(requiredWidthPx),
        deficitPx: round(deficitPx),
        hardDeficitCjk: measurement?.ceuPx ? round(deficitPx / measurement.ceuPx) : null,
        // +2 chars margin absorbs font/punctuation approximation error so a
        // single append clears the gate instead of leaving shortBy=1 loops.
        shortByChars: Math.max(1,
          Math.round(deficitPx / (measurement?.ceuPx ?? charsPerUnit)) + 2),
      };
    });
}
export function overflowDiagnostic(workspace: ResumeWorkspace): object | null {
  const overflowPx = workspace.compileResult.overflowPx;
  if (overflowPx <= 0) return null;
  const lineHeight = workspace.compileResult.bodyLineHeightPx;
  const charsPerLine =
    workspace.structure.language === "zh-CN"
      ? Math.max(20, Math.round(711 / Math.max(1, fontSizePx(workspace.compileResult))))
      : Math.max(30, Math.round((711 / Math.max(1, fontSizePx(workspace.compileResult))) * 1.9));
  const excessLines = lineHeight > 0 ? overflowPx / lineHeight : 1;
  const excessChars = Math.max(1, Math.round(excessLines * charsPerLine));
  return {
    overflowPx: round(overflowPx),
    excessChars,
    guidance: `Trim about ${excessChars} characters total using trim_text or replace_substring (shorten the longest bullets first); never remove evidence-bound facts entirely.`,
  };
}

export function writePlan(workspace: {
  sourceSnapshot: ResumeWorkspace["sourceSnapshot"];
  structure: ResumeWorkspace["structure"];
  bindings: readonly ResumeWorkspace["bindings"][number][];
}): object[] {
  const unusedByExperience = unusedEvidenceCountByExperience(workspace);
  return workspace.structure.sections.flatMap((section) =>
    section.items
      .filter((item) => Boolean(item.source_experience_id))
      .map((item) => {
        const current = item.bullets.length;
        const unused =
          unusedByExperience.get(item.source_experience_id ?? "") ?? 0;
        return {
          itemId: item.id,
          title: item.title,
          bullets: current,
          planned: current + (current === 0 && unused > 0 ? 1 : 0),
          missing: current === 0 && unused > 0 ? 1 : 0,
          unusedEvidenceCount: unused,
          maxDistinctBullets: current + unused,
        };
      }),
  );
}

/** 未消费证据总数；≤2 视为素材耗尽，继续写作无法达标。 */
export const EVIDENCE_EXHAUSTED_THRESHOLD = 2;

export function unusedEvidenceTotal(workspace: {
  sourceSnapshot: ResumeWorkspace["sourceSnapshot"];
  bindings: readonly ResumeWorkspace["bindings"][number][];
}): number {
  return rankAvailableEvidence(
    workspace.sourceSnapshot,
    workspace.bindings,
  ).length;
}

export function instructionFor(workspace: ResumeWorkspace): string {
  if (workspace.status === "ready_for_approval") {
    return "All source, content-quality, font, page, and bullet-tail gates pass. Stop editing; G5 save approval is not implemented yet.";
  }
  if (workspace.status === "needs_user_decision") {
    const usage = (workspace.compileResult.usageRatio * 100).toFixed(1);
    const minimum = workspace.compileResult.effectiveTargetBand.minimum * 100;
    if (unusedEvidenceTotal(workspace) <= EVIDENCE_EXHAUSTED_THRESHOLD) {
      // 素材耗尽：继续写作无法达标，明确引导用户补充经历。
      return `当前所选经历的素材不足：未消费证据已基本耗尽（页面占用率 ${usage}%，需 ≥${minimum.toFixed(0)}%），继续写作无法达标。请如实告知用户并引导其补充经历（具体项目、量化成果、技术栈等，要求可验证事实）后重新生成；若用户要求放宽匹配条件，调用 search_experiences 以更宽条件搜索。不得降低任何质量门槛，不得编造证据。`;
    }
    return `自动生成尚未完成：页面占用率 ${usage}%（需 ≥${minimum.toFixed(0)}%）${bulletTailDiagnostics(workspace).length ? "，存在尾行违规" : ""}。用修饰语改写补齐——基于已引用证据补充方法/对象/规模/结果细节，不依赖未消费证据；只有证据缺失导致内容无法成立时才如实说明，并给出两条出路：1) 用户补充或完善经历后重新生成；2) 用户要求放宽匹配条件时调用 search_experiences 以更宽条件搜索。不得降低任何质量门槛。`;
  }
  if (workspace.status === "layout_qualified") {
    return "All G3 source and layout gates pass; the host runs deterministic quality review automatically after this tool result.";
  }
  if (
    (workspace.status === "writing" || workspace.status === "needs_revision") &&
    unusedEvidenceTotal(workspace) <= EVIDENCE_EXHAUSTED_THRESHOLD
  ) {
    const usage = (workspace.compileResult.usageRatio * 100).toFixed(1);
    const minimum = workspace.compileResult.effectiveTargetBand.minimum;
    const maxReachable = maxReachableUsageRatio(workspace.compileResult);
    if (maxReachable >= minimum) {
      // 素材耗尽但补长可达标：用已引用证据补长，不需要未消费证据。
      return `未消费证据已耗尽，但仍可在既定行数规划内扩写现有 bullet 达到 ${(minimum * 100).toFixed(0)}%（当前 ${usage}%，页面物理上限约 ${(maxReachable * 100).toFixed(0)}%）。立即停止写新 bullet，基于已引用证据扩写背景、方法、行动或结果细节；不得字面重复，不得编造；补长到 ≥${(minimum * 100).toFixed(0)}% 后调用 inspect_resume_draft 完成最终校验。`;
    }
    // 素材耗尽 + 补长天花板不足：数学上无路可走，立即停止并交还用户。
    return `素材已耗尽（页面占用率 ${usage}%，当前版面可达上限约 ${(maxReachable * 100).toFixed(0)}%，需 ≥${(minimum * 100).toFixed(0)}%）：当前素材物理上无法写满一页。立即停止写作操作，不得字面重复或强行追加同一内容；先调用 inspect_resume_draft 完成校验收尾，然后如实说明缺口并引导用户补充经历/项目细节/量化成果/技术栈；若用户要求放宽匹配条件，调用 search_experiences 以更宽条件搜索。不得降低任何质量门槛，不得编造证据。`;
  }
  if (workspace.qualityReviewStarted) {
    return "Use only the reported repairTargets and bounded alternativeTargets. Do not modify frozen bullets or bypass the three-round limit.";
  }
  const budget = calculateResumeBudget(workspace.compileResult);
  const maxLines = workspace.maxBulletLines ?? 3;
  const linesPerBullet = Math.max(
    1,
    workspace.compileResult.bodyLineHeightPx * (maxLines + 0.2),
  );
  const remainingBullets = Math.max(1, Math.ceil(budget.pxToMinimum / linesPerBullet));
  const bulletChars = bulletCharTarget(workspace);
  const tailHints = bulletTailDiagnostics(workspace)
    .slice(0, 3)
    .map((diagnostic) => {
      const value = diagnostic as { bulletId: string; shortByChars: number };
      return `${value.bulletId}=${value.shortByChars}`;
    })
    .join(", ");
  const continuation =
    "You must continue calling patch_resume_candidate until status is ready_for_approval or needs_user_decision; never stop at writing or needs_revision.";
  const incremental =
    "Prefer incremental operations: append_text / prepend_text / insert_text to lengthen, trim_text or replace_substring to shorten, add_bullet for new items; avoid replace_bullet whole-bullet rewrites.";
  if (workspace.status === "writing") {
    const unwritten = unwrittenExperienceItemIds(workspace.structure);
    if (unwritten.length) {
      return `These source-backed experience items still need at least one distinct bullet: ${unwritten.join(", ")}. Add one grounded bullet for each, then use the physical page budget—not a host-fixed category count—to decide further bullets. Each should be about ${bulletChars}. ${incremental} ${continuation}`;
    }
    const planHints = writePlan(workspace)
      .filter((plan) => (plan as { unusedEvidenceCount: number }).unusedEvidenceCount > 0)
      .slice(0, 4)
      .map((plan) => {
        const value = plan as {
          itemId: string;
          unusedEvidenceCount: number;
        };
        return `${value.itemId} has ${value.unusedEvidenceCount} unused evidence candidates`;
      })
      .join("; ");
    const overTarget = workspace.compileResult.usageRatio >= 0.95;
    const closing = overTarget
      ? "Page is at/above 95%: STOP adding new bullets. Trim the 1-2 longest bullets (trim_text or replace_substring, keep evidence facts and numbers) until usage lands in [92%, 98%], then fix any remaining tail-deficit bullets."
      : `Submit one complete batch now, not a single lengthen-only tweak: ${planHints || "no unused evidence remains — lengthen the shortest grounded bullets"}. Use roughly ${remainingBullets} additional max-length bullets as a physical estimate, allocating them yourself by JD relevance and available evidence. New bullets about ${bulletChars} each so the last line stays ≥ 80% wide; every existing bullet must reach the same target length in this or the next batch.`;
    return `The page is at ${(workspace.compileResult.usageRatio * 100).toFixed(1)}% (need ≥${(workspace.compileResult.effectiveTargetBand.minimum * 100).toFixed(0)}%, max ${(workspace.compileResult.effectiveTargetBand.maximum * 100).toFixed(0)}%), roughly ${remainingBullets} more bullets. ${closing} ${incremental} ${continuation}`;
  }
  return `Fix the reported violations in one bounded batch of 2–8 incremental operations. Page overflow/multiple pages is the TOP priority: trim the longest bullets first (trim_text or replace_substring, keep evidence facts and numbers) until usage ≤ 100% and the page fits; only then fix tail-deficit bullets (${tailHints || "none"}): enrich each bullet's own wording with more precise/specific/quantified detail from its cited evidence (methods, object, scale, result, responsibility — about shortByChars +2-6 chars); no literal repeats, no new numbers; if the same bullet still has a tail deficit after 2 attempts, stop fixing it and move on — report it in needs_user_decision instead of looping. ${incremental} ${continuation}`;
}

function unusedEvidenceCountByExperience(workspace: {
  sourceSnapshot: ResumeWorkspace["sourceSnapshot"];
  bindings: readonly ResumeWorkspace["bindings"][number][];
}): Map<string, number> {
  const counts = new Map<string, number>();
  for (const candidate of rankAvailableEvidence(
    workspace.sourceSnapshot,
    workspace.bindings,
  )) {
    counts.set(
      candidate.experienceId,
      (counts.get(candidate.experienceId) ?? 0) + 1,
    );
  }
  return counts;
}

function bulletCharTarget(workspace: ResumeWorkspace): string {
  const budget = workspace.layoutBudget;
  if (budget) {
    const perLine = Math.max(1, budget.charsPerLine);
    const capacity = Math.max(1, budget.writableBulletCapacity);
    const linesPerBullet = budget.requiredBulletLinesAtMinimum / capacity;
    // 指令目标展示预算需要的每 bullet 行数（aim），但不超过 3 行物理上限；
    // 与写时默认区间（perLine 下限）区分：写时不强拒，指令层推长度。
    const minimum = Math.max(
      perLine,
      Math.min(perLine * 3, Math.round(perLine * linesPerBullet)),
    );
    const maximum = perLine * budget.maxBulletLines;
    return workspace.structure.language === "zh-CN" ? `${minimum}–${maximum} 个汉字` : `${minimum}–${maximum} characters`;
  }
  const compile = workspace.compileResult;
  const fontSize = fontSizePx(workspace.compileResult);
  const firstBulletWidth = compile.bullets[0]?.availableLineWidthPx;
  const widthPx =
    firstBulletWidth !== undefined && firstBulletWidth > 0
      ? firstBulletWidth
      : 711;
  const charsPerLine =
    workspace.structure.language === "zh-CN"
      ? Math.max(20, Math.round(widthPx / fontSize))
      : Math.max(30, Math.round((widthPx / fontSize) * 1.9));
  const minimum = Math.round(charsPerLine * 1.68);
  const maximum = Math.round(charsPerLine * (workspace.maxBulletLines ?? 3));
  return workspace.structure.language === "zh-CN"
    ? `${minimum}–${maximum} 个汉字`
    : `${minimum}–${maximum} characters`;
}

function fontSizePx(compileResult: ResumeWorkspace["compileResult"]): number {
  return compileResult.bodyFontSizePx > 0 ? compileResult.bodyFontSizePx : 13;
}

function characterFactor(
  bodyFontSizePx: number,
  language: ResumeStructure["language"],
): number {
  return language === "zh-CN"
    ? Math.max(1, bodyFontSizePx)
    : Math.max(1, bodyFontSizePx / 1.9);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
