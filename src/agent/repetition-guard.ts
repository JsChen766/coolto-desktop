import type {
  BeforeToolCallContext,
  BeforeToolCallResult,
} from "@earendil-works/pi-agent-core";

const DOMAIN_GOVERNED_OR_READ_ONLY_TOOLS = new Set([
  "create_resume_workspace",
  "apply_resume_content",
  "get_resume_workspace",
  "search_jds",
  "get_jd",
  "search_experiences",
]);

/** Blocks the second exact call unless the first result was transient. */
export function createRepetitionGuard(limit = 2) {
  let lastKey: string | undefined;
  let consecutive = 0;
  let transientRetryUsed = false;
  let runMarker: string | undefined;
  const experienceReads = new Set<string>();
  return async (
    context: BeforeToolCallContext,
  ): Promise<BeforeToolCallResult | undefined> => {
    const marker = latestUserMarker(context.context.messages);
    if (marker !== runMarker) {
      runMarker = marker;
      experienceReads.clear();
      lastKey = undefined;
      consecutive = 0;
      transientRetryUsed = false;
    }
    const key = `${context.toolCall.name}\u0000${stableStringify(context.args)}`;
    if (context.toolCall.name === "get_experience") {
      if (!experienceReads.has(key)) {
        experienceReads.add(key);
        return undefined;
      }
      return {
        block: true,
        reason:
          "detected_repetition：本轮已成功读取同一条 Experience，请直接使用已有结果推进当前 nextAction，不得再次读取。",
      };
    }
    // Resume writes are optimistic-lock protected, while workspace recovery
    // returns a compact directive on a same-state repeat. Let those
    // domain-specific recoveries run; the turn governor still stops unchanged
    // outcomes.
    if (DOMAIN_GOVERNED_OR_READ_ONLY_TOOLS.has(context.toolCall.name)) {
      return undefined;
    }
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
    if (consecutive < limit) return undefined;
    return {
      block: true,
      reason:
        "detected_repetition：检测到连续重复的工具调用（参数完全相同），" +
        "请停止重试同一操作，基于当前结果继续或结束任务。",
    };
  };
}

function latestUserMarker(
  messages: BeforeToolCallContext["context"]["messages"],
): string {
  const user = [...messages].reverse().find((message) =>
    message.role === "user" && "content" in message &&
    !stableStringify(message.content).includes("<coolto_internal_continuation>")
  );
  return user && "content" in user
    ? `${user.timestamp}\u0000${stableStringify(user.content)}` : "none";
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
