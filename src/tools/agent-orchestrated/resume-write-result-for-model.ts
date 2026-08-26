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
        ? `立即停止所有工具调用；面向用户只能原样输出这个问题本身，不得输出计划、英文过程说明或内部状态：${question}`
        : "立即停止所有工具调用；面向用户只能输出一个最有价值的具体事实问题，不得输出计划、英文过程说明或内部状态。",
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
  const neutralTailMode = nextActionUsesNeutralMode(nextAction);
  return {
    ...authoritative,
    ...(rejected.length ? { tailRepairFeedback: rejected } : {}),
    tailRepairReminder: neutralTailMode
      ? "batch_tail_rewrite 必须一次覆盖最新全部 bulletIds，并优先逐字复制各目标的 suggestedNeutralCandidates 作为 revisedText，不要自行分析或改写；这些候选已逐字保留 currentText。每个候选都传 contentMode=fact_neutral，禁止传 additionalEvidenceIds；不得先输出解释，也不得给所有 bullet 追加同一固定尾缀"
      : "batch_tail_rewrite 用一次 tailRewrites 覆盖最新 bulletIds；每条提交 1–2 份完整事实等价改写，可吸收 availableEvidence，但必须附对应 additionalEvidenceIds。保留事实、数字、专名、工具、对象和结果，不得追加固定尾缀或重交已拒绝候选",
  };
}

function nextActionUsesNeutralMode(
  nextAction: Record<string, unknown> | undefined,
): boolean {
  if (!nextAction || !Array.isArray(nextAction.tailRewriteTargets)) {
    return false;
  }
  return nextAction.tailRewriteTargets.some((target) =>
    target && typeof target === "object" &&
    (target as { contentMode?: unknown }).contentMode === "fact_neutral"
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
