import type { TailGrowthFailureType } from "./tail-repair-state.js";

export function tailGrowthInstruction(
  lastFailureType: TailGrowthFailureType | undefined,
  growthHint: string,
): string {
  return `${failureDirection(lastFailureType)}锁定 currentText，不得改写、删减或重交全文。${growthHint}。从“专业方法、行动对象、指标/范围、过程细节、交付物、证据支持的结果”中自由选择一个尚未充分表达的方向，只返回可直接接在 currentText 后的 growthText。片段必须被 sourceQuotes 支持，不得编造数字、结果或抽象效果；不要写开头连接标点、句末标点、候选或多个版本。宿主会确定性拼接并用 Chromium 验收。`;
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
