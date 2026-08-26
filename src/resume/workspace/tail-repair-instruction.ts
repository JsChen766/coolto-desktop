import type { TailGrowthFailureType } from "./tail-repair-state.js";
import type { TailAttemptFeedback } from "./tail-repair-state.js";
import type { TailLengthBudget } from "./tail-length-budget.js";

export function tailGrowthInstruction(
  lastFailureType: TailGrowthFailureType | undefined,
  growthHint: string,
  budget?: TailLengthBudget,
  attempt?: TailAttemptFeedback,
  lastFailureReason?: string,
): string {
  return `${failureDirection(lastFailureType)}${attemptDirection(attempt)}${reasonDirection(lastFailureReason)}锁定 currentText，不得改写、删减或重交全文。${growthHint}。${budgetDirection(budget)}只使用 sourceQuotes 支持且尚未表达的事实，只返回一个可直接接在 currentText 后的 growthText；不得编造数字、结果或抽象效果，不得添加开头连接标点、句末标点、Markdown、链接、换行、候选或多个版本。宿主会确定性拼接并用 Chromium 验收。`;
}

function budgetDirection(budget: TailLengthBudget | undefined): string {
  if (!budget) return "";
  return `新增片段目标视觉长度约 ${budget.minimumGrowthCjk}–${budget.maximumGrowthCjk} CEU，理想值约 ${budget.idealGrowthCjk} CEU；CEU 是当前字号宋体全角汉字等效宽度，不是字面字符数。`;
}

function attemptDirection(attempt: TailAttemptFeedback | undefined): string {
  if (!attempt) return "";
  if (attempt.requiredDirection === "increase") {
    return `上次片段实测增长 ${attempt.actualGrowthCjk} CEU，距离正式门槛仍缺 ${attempt.remainingToHardCjk} CEU、距离理想目标仍缺 ${attempt.remainingToIdealCjk} CEU；保持事实方向，只返回更长的替换 growthText。`;
  }
  if (attempt.requiredDirection === "decrease") {
    return `上次片段超过软上限约 ${attempt.excessOverMaximumCjk} CEU；保持事实方向，只返回更短的替换 growthText。`;
  }
  return "上次片段改变了锁定行数；不要继续硬追加，等待宿主切换整句 reflow。";
}

function reasonDirection(reason: string | undefined): string {
  if (!reason) return "";
  if (/空泛|抽象/u.test(reason)) {
    return "原片段因空泛或抽象结尾被拒绝；只保留来源里的具体对象、范围、方法或数字，删除抽象效果。";
  }
  return `原片段被拒绝：${reason.slice(0, 120)}。`;
}

function failureDirection(failure: TailGrowthFailureType | undefined): string {
  switch (failure) {
    case "too_long":
      return "上一片段导致行数变化；本轮换成更短的单一具体细节。";
    case "insufficient_growth":
      return "上一片段增长不足；本轮补一个更完整的具体短语或分句。";
    case "invalid_content":
      return "上一片段未通过内容或证据校验；本轮更换为来源中明确存在的具体事实。";
    case "duplicate":
      return "上一片段重复或重交全文；本轮必须更换增长方向。";
    default:
      return "";
  }
}
