interface TailFeedbackEntry {
  bulletId?: unknown;
  status?: unknown;
  reason?: unknown;
}

/** Keep the latest baseline authoritative without replaying old measured text. */
export function resumeWriteResultForModel(
  result: Record<string, unknown>,
): Record<string, unknown> {
  const nextAction = record(result.nextAction);
  if (nextAction?.mode === "request_more_material") {
    const question = typeof nextAction.question === "string"
      ? nextAction.question
      : undefined;
    const {
      rewriteWarning: _rewriteWarning,
      tailRepairFeedback: _tailRepairFeedback,
      tailRepairDiagnostics: _tailRepairDiagnostics,
      ...authoritative
    } = result;
    return {
      ...authoritative,
      terminalInstruction: question
        ? `立即停止所有工具调用，直接向用户提出这个问题：${question}`
        : "立即停止所有工具调用，直接向用户询问一个最有价值的具体事实。",
    };
  }
  if (!Array.isArray(result.tailRepairFeedback)) return result;
  const rejected = result.tailRepairFeedback.flatMap((value) => {
    const entry = value && typeof value === "object"
      ? value as TailFeedbackEntry
      : undefined;
    if (entry?.status !== "rejected" ||
      typeof entry.bulletId !== "string") return [];
    return [{
      bulletId: entry.bulletId,
      status: "rejected" as const,
      ...(typeof entry.reason === "string" ? { reason: entry.reason } : {}),
    }];
  });
  const {
    rewriteWarning: _rewriteWarning,
    writeRejectedReason: _writeRejectedReason,
    tailRepairFeedback: _tailRepairFeedback,
    ...authoritative
  } = result;
  return {
    ...authoritative,
    ...(rejected.length ? { tailRepairFeedback: rejected } : {}),
    tailRepairReminder: nextAction?.mode === "batch_tail_reflow"
      ? "一次 lineRewrites 覆盖最新 bulletIds 的全部目标。逐条执行 requiredEdit：currentText 的每个原字符必须按原顺序完整保留，只能插入事实中性的定语、补语、连接语或既有关系表达；提交一份完整 revisedText，不得删除、替换、调序、加入新事实或生成候选。rejectedReflows 只用于避免复读，宿主会执行正式内容校验与 Chromium 门禁"
      : "一次 tailGrowths 覆盖最新 bulletIds 的全部目标。currentText 是锁定的正式基线，禁止改写或重交全文；逐条执行 requiredEdit，只提交一个可直接接在 currentText 后的 growthText。增长片段从 sourceQuotes 中选择尚未充分表达的方法、对象、指标、范围、过程、交付物或结果，不得编造；rejectedGrowths 只用于避免复读。宿主会确定性拼接、执行正式内容校验并用 Chromium 验收，禁止候选和多版本",
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
