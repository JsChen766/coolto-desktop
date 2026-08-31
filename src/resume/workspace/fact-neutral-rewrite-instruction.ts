export const FACT_NEUTRAL_REWRITE_INSTRUCTION = [
  "用户已确认没有更多事实。每个 revisedText 必须把 currentText 的每个字符按原顺序逐字保留，只能在其中插入事实中性的衔接或结构表达；不得删除、替换、改写或调换原文字符。",
  "先识别背景、能力或方法、具体行动与证据支持的结果；优先在这些事实组件之间插入“其中”“同时”“在此基础上”等合理连接，只有没有清晰内部边界时才放在背景之前或结果之后。三分之二只是排版验收条件，不得默认在句尾追加填充。",
  "连接内容不需要新 evidence，但不得加入新的职责、动作、方法、对象、工具、交付物、结果、评价或因果。优先把 suggestedNeutralCandidates 原样作为 revisedText 提交；一次覆盖本批全部目标，每条提交 1–2 份完整 revisedText，传 contentMode=fact_neutral 且不得传 additionalEvidenceIds。禁止跨 bullet 重复同类中性表述或固定尾缀。",
].join("");
