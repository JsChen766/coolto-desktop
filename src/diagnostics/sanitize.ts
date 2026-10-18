const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/gu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/giu,
  /\b(api[_-]?key|apikey|llm_api_key|openai_api_key)\s*[:=]\s*\S+/giu,
  /\/(?:Users|home)\/[^\s"'\\]+/gu,
  /[A-Za-z]:\\Users\\[^\s"'\\]+/gu,
];

const FORBIDDEN_DETAIL_KEYS = new Set([
  "content",
  "text",
  "body",
  "prompt",
  "message",
  "email",
  "phone",
  "fullName",
  "passphrase",
  "password",
  "apiKey",
  "token",
  "cookie",
  "sourceQuote",
  "absolutePath",
  "path",
]);

/** Strip secrets and absolute paths from a free-form string for log lines. */
export function redactDiagnosticText(value: string): string {
  let next = value;
  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, "[redacted]");
  }
  return next;
}

/** Keep only metadata-safe detail fields; drop known body/credential keys. */
export function sanitizeDiagnosticDetail(
  detail: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!detail) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (FORBIDDEN_DETAIL_KEYS.has(key)) continue;
    if (value === null) {
      out[key] = null;
      continue;
    }
    if (typeof value === "string") {
      out[key] = redactDiagnosticText(value).slice(0, 120);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
