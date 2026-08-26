export const FACT_NEUTRAL_REWRITE_INSTRUCTION = [
  "用户已确认没有更多事实。每个 revisedText 必须把 currentText 的每个字符按原顺序逐字保留，只能在其中插入事实中性的衔接或结构表达；不得删除、替换、改写或调换原文字符。",
  "候选只能补充如“其中”“同时”“在此基础上”“就相关判断而言”这类不承载新事实的连接表达；不得加入新的职责、动作、方法、对象、工具、交付物、结果、评价或因果。",
  "优先把 suggestedNeutralCandidates 原样作为 revisedText 提交，不要自行逐字分析或改写。一次覆盖本批全部目标，每条提交 1–2 份完整 revisedText；每个候选都传 contentMode=fact_neutral，且不得传 additionalEvidenceIds。禁止只在所有 bullet 末尾重复同一固定尾缀。",
].join("");
