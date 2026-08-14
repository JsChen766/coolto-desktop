import type { CreditBalanceDetail } from "../shared/types.js";

const INSUFFICIENT_CREDITS_CODE = "insufficient_credits";

/**
 * Detects a gateway insufficient_credits rejection inside a pi-ai error
 * message. pi-ai folds provider HTTP errors into a display string shaped
 * `"402: {json body}"` (the openai SDK error body); the gateway envelope
 * carries `error.code` and `error.detail` which survive this serialization.
 */
export function extractInsufficientCreditsDetail(
  errorMessage: string,
): CreditBalanceDetail | undefined {
  const start = errorMessage.indexOf("{");
  if (start === -1) return undefined;
  let parsed: { error?: { code?: string; detail?: Partial<CreditBalanceDetail> } };
  try {
    parsed = JSON.parse(errorMessage.slice(start)) as typeof parsed;
  } catch {
    return undefined;
  }
  if (parsed.error?.code !== INSUFFICIENT_CREDITS_CODE) return undefined;
  const detail = parsed.error.detail;
  if (!detail || typeof detail.total !== "number") return undefined;
  return {
    total: detail.total,
    weeklyFree: detail.weeklyFree ?? 0,
    creditBalance: detail.creditBalance ?? 0,
    estimated: detail.estimated ?? 0,
  };
}
