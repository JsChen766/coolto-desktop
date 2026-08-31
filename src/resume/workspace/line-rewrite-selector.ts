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
import { duplicateNovelLineRewriteReasons } from
  "./line-rewrite-duplication.js";
import type { ResumeWorkspace } from "./types.js";

export interface LineRewriteInput {
  bulletId: string;
  revisedText: string;
  contentMode?: "fact_neutral";
}

export interface LineRewriteSelection {
  updates: Array<{ bulletId: string; text: string }>;
  diagnostics: LineRewriteDiagnostics;
  writeRejectedReason?: string;
}

export interface LineRewriteDiagnostics {
  phase: "page_fill" | "bullet_depth";
  requestedTargetCount: number;
  measuredRewriteCount: number;
  appliedRewriteCount: number;
  stackedProgressCount: number;
  heightGrowthCount: number;
  skippedRewriteCount: number;
  feedback: LineRewriteFeedback[];
}

export interface LineRewriteFeedback {
  bulletId: string;
  status: "applied" | "rejected";
  progressType?: "stacked" | "height_growth";
  /** Exact compact insertion that was rejected, so the model can avoid retrying it. */
  rejectedInsertText?: string;
  failureType?:
    | "crossed_line_limit"
    | "unchanged_or_shorter"
    | "line_count_decreased"
    | "capacity_not_selected"
    | "duplicate_growth"
    | "content_validation_failed";
  reason?: string;
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
  const duplicateReasons = duplicateNovelLineRewriteReasons(targets);
  const measured = await measureLineRewrites(
    workspace,
    targets.filter((target) => !duplicateReasons.has(target.bulletId)),
    compiler,
  );
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
  const feedback: LineRewriteFeedback[] = [
    ...[...duplicateReasons].map(([bulletId, reason]) => ({
      bulletId,
      status: "rejected" as const,
      failureType: "duplicate_growth" as const,
      reason,
    })),
    ...rewriteFeedback(
      measured,
      new Set(updates.map((update) => update.bulletId)),
    ),
  ];
  const rejectedFeedback = feedback.filter((entry) =>
    entry.status === "rejected"
  );
  const warning = rejectedFeedback.length
    ? rejectedFeedback.map((entry) =>
      `${entry.bulletId}: ${entry.reason ?? "本批未安全应用"}`
    ).join("；")
    : undefined;
  const diagnostics = rewriteDiagnostics(
    options.goal ?? "page_fill",
    inputs.length,
    measured,
    updates,
    stacked,
    feedback,
  );
  if (updates.length) {
    return { updates, diagnostics, ...(warning ? { writeRejectedReason: warning } : {}) };
  }
  return {
    updates: [],
    diagnostics,
    writeRejectedReason: warning ?? (options.goal === "bullet_depth"
      ? "lineRewrites 未产生可叠加的深度增长或安全跨行，草稿未修改"
      : "lineRewrites 未产生可叠加的文本增长或安全页面增高，草稿未修改"),
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
  feedback: LineRewriteFeedback[],
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
    feedback,
  };
}

function rewriteFeedback(
  measured: readonly MeasuredLineRewrite[],
  applied: ReadonlySet<string>,
): LineRewriteFeedback[] {
  return measured.map((rewrite) => {
    if (applied.has(rewrite.bulletId)) {
      return {
        bulletId: rewrite.bulletId,
        status: "applied",
        progressType: rewrite.addedLines > 0 ? "height_growth" : "stacked",
      };
    }
    if (!rewrite.withinLineLimit) {
      return {
        bulletId: rewrite.bulletId,
        status: "rejected",
        failureType: "crossed_line_limit",
        reason: `改写实测为 ${rewrite.lineCount} 行，超过该 bullet 已锁定的行数；基于最新 currentText 少补一个最有价值的来源事实点`,
      };
    }
    if (rewrite.characterGrowth <= 0) {
      return {
        bulletId: rewrite.bulletId,
        status: "rejected",
        failureType: "unchanged_or_shorter",
        reason: "改写没有比最新 currentText 更长；必须保留原文并明显补充一个来源支持的具体环节",
      };
    }
    if (rewrite.addedLines < 0) {
      return {
        bulletId: rewrite.bulletId,
        status: "rejected",
        failureType: "line_count_decreased",
        reason: "改写导致行数下降；必须保留原有信息并扩写，不能删减",
      };
    }
    return {
      bulletId: rewrite.bulletId,
      status: "rejected",
      failureType: "capacity_not_selected",
      reason: "本轮跨行结果未进入剩余单页容量的安全子集；服从最新 nextAction，不要重交旧批",
    };
  });
}
