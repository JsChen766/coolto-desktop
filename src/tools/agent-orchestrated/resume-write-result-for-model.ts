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
    tailRepairReminder:
      "一次提交最新 bulletIds 的全部目标。逐条执行 requiredEdit，只做语义工作：基于 currentText 判断背景、专业方法、具体行动、可验证结果中尚未表达且有来源的环节，再自然重写完整 bullet。严格保持每个目标的 currentLineCount，不要计算字符或像素；宿主会用 Chromium 验收。保留事实、数字、对象和结果，只提交唯一 revisedText，禁止候选和多版本",
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
