import type {
  BeforeToolCallContext,
  BeforeToolCallResult,
} from "@earendil-works/pi-agent-core";

/** Blocks the second exact call unless the first result was transient. */
export function createRepetitionGuard(limit = 2) {
  let lastKey: string | undefined;
  let consecutive = 0;
  let transientRetryUsed = false;
  return async (
    context: BeforeToolCallContext,
  ): Promise<BeforeToolCallResult | undefined> => {
    // Resume writes are optimistic-lock protected, while workspace recovery
    // returns a compact directive on a same-state repeat. Let those
    // domain-specific recoveries run; the turn governor still stops unchanged
    // outcomes.
    if (context.toolCall.name === "apply_resume_content" ||
      context.toolCall.name === "get_resume_workspace") return undefined;
    const key = `${context.toolCall.name}\u0000${stableStringify(context.args)}`;
    if (key === lastKey) {
      if (!transientRetryUsed && lastToolResultWasTransient(context)) {
        transientRetryUsed = true;
        return undefined;
      }
      consecutive += 1;
    } else {
      lastKey = key;
      consecutive = 1;
      transientRetryUsed = false;
    }
    const effectiveLimit = context.toolCall.name === "capture_browser_mail_event"
      ? Math.max(limit, 3)
      : limit;
    if (consecutive < effectiveLimit) return undefined;
    return {
      block: true,
      reason:
        "detected_repetition：检测到连续重复的工具调用（参数完全相同），" +
        "请停止重试同一操作，基于当前结果继续或结束任务。",
    };
  };
}

function lastToolResultWasTransient(context: BeforeToolCallContext): boolean {
  const message = [...context.context.messages].reverse().find((entry) =>
    entry.role === "toolResult"
  ) as unknown as Record<string, unknown> | undefined;
  if (!message || message.isError !== true ||
    message.toolName !== context.toolCall.name) return false;
  return /timeout|timed out|temporar|econn|network|socket|429|502|503|504|rate.?limit/iu.test(
    JSON.stringify(message.content ?? ""),
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
