/** Friendly message for errors shown in the chat stream / login form. */
export function desktopErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cleaned = message
    .replace(/^Error invoking remote method '[^']+':\s*/u, "")
    .replace(/^Error:\s*/u, "");

  if (/insufficient_credits|余额不足|402/iu.test(cleaned)) {
    return "余额不足，请先补充额度或等待每周免费额度恢复。";
  }
  // Gateway/proxy errors may embed the API envelope as JSON text; fall back
  // to the envelope's human-readable message instead of dumping raw JSON.
  const envelopeMessage = cleaned.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/u);
  if (envelopeMessage?.[1] && /"code"\s*:/.test(cleaned)) {
    return envelopeMessage[1];
  }
  return cleaned;
}
