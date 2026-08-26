/** Friendly message for errors shown in the chat stream / login form. */
export function desktopErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cleaned = message
    .replace(/^Error invoking remote method '[^']+':\s*/u, "")
    .replace(/^Error:\s*/u, "");

  if (/insufficient_credits|余额不足|402/iu.test(cleaned)) {
    return "余额不足，请先补充额度或等待每周免费额度恢复。";
  }
  if (/already processing/iu.test(cleaned)) {
    return "正在处理上一条消息，请稍候再试。";
  }
  if (/candidate_not_exportable|Refusing to print an unqualified|尚不能导出/iu.test(cleaned)) {
    return "当前简历尚未通过生成门槛，请先继续完善。";
  }
  if (/candidate_not_ready_for_save|尚不能保存/iu.test(cleaned)) {
    return "当前简历尚未达到保存条件，请先处理未完成项。";
  }
  if (/stale_candidate_revision|expectedRevision/iu.test(cleaned)) {
    return "简历内容已经更新，请重新打开后再试。";
  }
  // Gateway/proxy errors may embed the API envelope as JSON text; fall back
  // to the envelope's human-readable message instead of dumping raw JSON.
  const envelopeMessage = cleaned.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/u);
  if (envelopeMessage?.[1] && /"code"\s*:/.test(cleaned)) {
    return envelopeMessage[1];
  }
  return /resume-drafts:|ipc|candidateId|revisionId/iu.test(cleaned)
    ? "操作未完成，请重新打开当前内容后再试。"
    : cleaned;
}
