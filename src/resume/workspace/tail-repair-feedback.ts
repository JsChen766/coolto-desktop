import {
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import type { TailRepairOptionKind } from "./tail-repair-plan.js";
import type { ResumeWorkspace } from "./types.js";

export interface TailRepairAttemptFeedback {
  optionIndex: number;
  kind: TailRepairOptionKind;
  characterCount: number;
  lineCount: number;
  lineDelta: number;
  lastLineWidthPx: number;
  availableLineWidthPx: number;
  lastLineRatio: number;
  tailWidthDeficitPx: number;
  tailPassed: boolean;
  withinLineLimit: boolean;
  eligible: boolean;
}

export interface TailRepairTargetFeedback {
  bulletId: string;
  role?: "repair" | "page_balance";
  rejectionReason?: string;
  selectedOptionIndex?: number;
  selectedFromCache?: boolean;
  attempts: TailRepairAttemptFeedback[];
}

export function tailRepairLineDeltaBounds(workspace: ResumeWorkspace) {
  const compile = workspace.compileResult;
  const lineHeight = Math.max(1, compile.bodyLineHeightPx);
  return {
    minimum: Math.ceil(
      (compile.availableHeightPx * RESUME_GLOBAL_MINIMUM_USAGE_RATIO -
        compile.usedHeightPx - RESUME_LAYOUT_TOLERANCE_PX) / lineHeight,
    ),
    maximum: Math.floor(
      (compile.availableHeightPx - compile.usedHeightPx +
        RESUME_LAYOUT_TOLERANCE_PX) / lineHeight,
    ),
  };
}

export function tailRepairFeedbackWarning(
  repaired: number,
  total: number,
  unresolved: readonly TailRepairTargetFeedback[],
  minimum: number,
  maximum: number,
): string {
  const details = unresolved.map((target) =>
    `${target.bulletId}: ${target.rejectionReason ?? target.attempts.map((attempt) =>
      `#${attempt.optionIndex} ${attempt.kind} ` +
      `${attempt.characterCount}字/${attempt.lineCount}行/Δ${attempt.lineDelta}/` +
      `尾行${Math.round(attempt.lastLineRatio * 100)}%/` +
      `${attempt.eligible ? "合格但页面组合未入选" : "未合格"}`
    ).join("，")}`
  ).join("；");
  return `本批已落地 ${repaired}/${total} 条；未落地候选实测：${details || "none"}；` +
    `页面必须保持 92%–100%，允许净行数变化=${minimum}..${maximum}`;
}
