import type { TailLengthBudget } from "./tail-length-budget.js";

export function semanticTailRewriteInstruction(
  budget: TailLengthBudget | undefined,
): string {
  const retry = budget && budget.currentRatio >= 0.35
    ? "currentText 是上一轮已实测变好的临时工作稿；本轮必须保留当前工作基线，只做最小语义增补，不得重新缩短或退回原句。"
    : "";
  const target = budget
    ? `当前尾行 ${percent(budget.currentRatio)}，正式门槛为三分之二，优先写到约 74%。expand 完整句的总视觉长度必须约 ${budget.minimumFinalCjk}–${budget.maximumFinalCjk} CEU，理想约 ${budget.idealFinalCjk} CEU；这不是“再加几个字”，而是整句完成后的总长度。compact 只有在保留全部关键事实且能把整句压到约 ${budget.compactIdealCjk} CEU、真实减少一行时才提交，否则提交两份不同的 expand。`
    : "正式尾行门槛为三分之二，优先写到约 74%。";
  return `${target}${retry}提交 1–2 份完整、自然的 revisedText，不得只追加尾缀。允许调整语序、替换表达、合并或删除赘词，但必须保留 currentText 的关键事实、全部数字、专名、工具、对象和结果。compact 可通过重组把短尾收回上一行；expand 只能吸收 sourceQuotes 中尚未表达的具体方法、范围、对象或结果。禁止编造、机械总结、固定结尾、候选解释、Markdown、换行和句末标点。`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
