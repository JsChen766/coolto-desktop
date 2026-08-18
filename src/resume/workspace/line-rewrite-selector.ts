import {
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import type { ResumeCompiler } from "./compiler-port.js";
import { chooseLineGrowthPlan } from "./line-growth-plan.js";
import {
  measureLineRewrites,
  type MeasuredLineRewrite,
} from "./line-rewrite-measurement.js";
import type { ResumeWorkspace } from "./types.js";

export interface LineRewriteInput {
  bulletId: string;
  revisedText: string;
}

export interface LineRewriteSelection {
  updates: Array<{ bulletId: string; text: string }>;
  diagnostics: {
    phase: "page_fill" | "bullet_depth";
    requestedTargetCount: number;
    measuredRewriteCount: number;
    appliedRewriteCount: number;
    stackedProgressCount: number;
    heightGrowthCount: number;
    skippedRewriteCount: number;
  };
  writeRejectedReason?: string;
}

export interface LineRewriteSelectionOptions {
  goal?: "page_fill" | "bullet_depth";
  minimumLines?: number;
}

/** Applies stacking immediately; only page-fill growth is capacity-selected. */
export async function selectLineRewrites(
  workspace: ResumeWorkspace,
  inputs: readonly LineRewriteInput[],
  compiler: ResumeCompiler,
  options: LineRewriteSelectionOptions = {},
): Promise<LineRewriteSelection> {
  const current = currentBulletTexts(workspace);
  const seen = new Set<string>();
  const targets = inputs.map((input) => {
    if (seen.has(input.bulletId)) {
      throw new Error(`bullet ${input.bulletId} 在扩写批次中重复`);
    }
    seen.add(input.bulletId);
    const existing = current.get(input.bulletId);
    const baseline = workspace.compileResult.bullets.find(
      (bullet) => bullet.bulletId === input.bulletId,
    );
    if (existing === undefined) throw new Error(`bullet ${input.bulletId} 不在当前工作区`);
    if (!baseline) throw new Error(`bullet ${input.bulletId} 缺少当前测量`);
    return {
      bulletId: input.bulletId,
      existing,
      baselineLines: baseline.lineCount,
      revisedText: input.revisedText.trim(),
    };
  });
  const measured = await measureLineRewrites(workspace, targets, compiler);
  const stacked = measured.filter((rewrite) =>
    rewrite.eligible && rewrite.addedLines === 0
  );
  const lineGrowth = measured.filter((rewrite) =>
    rewrite.eligible && rewrite.addedLines > 0
  );
  const selectedGrowth = options.goal === "bullet_depth"
    ? lineGrowth.filter((rewrite) =>
        rewrite.lineCount >= (options.minimumLines ?? 2)
      )
    : chooseLineGrowthPlan(
        lineGrowth,
        requiredLines(workspace),
        remainingLineCapacity(workspace),
      )?.rewrites ?? [];
  const selectedGrowthIds = new Set(
    selectedGrowth.map((rewrite) => rewrite.bulletId),
  );
  const updates = measured.filter((rewrite) =>
    stacked.includes(rewrite) || selectedGrowthIds.has(rewrite.bulletId)
  ).map((rewrite) => ({ bulletId: rewrite.bulletId, text: rewrite.text }));
  const skipped = measured.filter((rewrite) =>
    !updates.some((update) => update.bulletId === rewrite.bulletId)
  );
  const warning = skipped.length
    ? `本批未应用：${skipped.map((rewrite) => rewrite.bulletId).join(",")}`
    : undefined;
  const diagnostics = rewriteDiagnostics(
    options.goal ?? "page_fill",
    inputs.length,
    measured,
    updates,
    stacked,
  );
  if (updates.length) {
    return { updates, diagnostics, ...(warning ? { writeRejectedReason: warning } : {}) };
  }
  return {
    updates: [],
    diagnostics,
    writeRejectedReason: options.goal === "bullet_depth"
      ? "lineRewrites 未产生可叠加的深度增长或安全跨行，草稿未修改"
      : "lineRewrites 未产生可叠加的文本增长或安全页面增高，草稿未修改",
  };
}

function currentBulletTexts(workspace: ResumeWorkspace): Map<string, string> {
  return new Map(workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.bullets.map((bullet) => [bullet.id, bullet.text] as const),
    ),
  ));
}

function requiredLines(workspace: ResumeWorkspace): number {
  const compile = workspace.compileResult;
  const deficit = Math.max(
    0,
    compile.availableHeightPx * RESUME_GLOBAL_MINIMUM_USAGE_RATIO -
      compile.usedHeightPx - RESUME_LAYOUT_TOLERANCE_PX,
  );
  return Math.max(1, Math.ceil(deficit / Math.max(1, compile.bodyLineHeightPx)));
}

function remainingLineCapacity(workspace: ResumeWorkspace): number {
  const compile = workspace.compileResult;
  return Math.max(0, Math.floor(
    (compile.availableHeightPx - compile.usedHeightPx +
      RESUME_LAYOUT_TOLERANCE_PX) / Math.max(1, compile.bodyLineHeightPx),
  ));
}

function rewriteDiagnostics(
  phase: "page_fill" | "bullet_depth",
  requestedTargetCount: number,
  measured: readonly MeasuredLineRewrite[],
  updates: readonly { bulletId: string }[],
  stacked: readonly MeasuredLineRewrite[],
) {
  const applied = new Set(updates.map((update) => update.bulletId));
  return {
    phase,
    requestedTargetCount,
    measuredRewriteCount: measured.length,
    appliedRewriteCount: updates.length,
    stackedProgressCount: stacked.filter((rewrite) =>
      applied.has(rewrite.bulletId)
    ).length,
    heightGrowthCount: measured.filter((rewrite) =>
      applied.has(rewrite.bulletId) && rewrite.addedLines > 0
    ).length,
    skippedRewriteCount: measured.length - updates.length,
  };
}
