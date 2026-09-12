import type {
  BeforeToolCallContext,
  BeforeToolCallResult,
} from "@earendil-works/pi-agent-core";
import {
  createResumeReadLedger,
  type ResumeReadAsset,
} from "../resume/workspace/recovery-contract.js";

const DOMAIN_GOVERNED_OR_READ_ONLY_TOOLS = new Set([
  "create_resume_workspace",
  "apply_resume_content",
  "get_resume_workspace",
  "search_jds",
  "get_jd",
  "search_experiences",
]);
const READ_ONCE_TOOLS: Record<string, ResumeReadAsset> = {
  get_experience: "experience",
  get_jd: "jd",
  get_resume: "resume",
  find_resume_reuse_candidates: "jd",
};

/** Blocks the second exact call unless the first result was transient. */
export function createRepetitionGuard(limit = 2) {
  let lastKey: string | undefined;
  let consecutive = 0;
  let transientRetryUsed = false;
  let runMarker: string | undefined;
  const readLedger = createResumeReadLedger();
  const pendingReads = new Map<string, {
    asset: ResumeReadAsset;
    key: string;
  }>();
  return async (
    context: BeforeToolCallContext,
  ): Promise<BeforeToolCallResult | undefined> => {
    const marker = latestUserMarker(context.context.messages);
    if (marker !== runMarker) {
      runMarker = marker;
      readLedger.reset();
      pendingReads.clear();
      lastKey = undefined;
      consecutive = 0;
      transientRetryUsed = false;
    }
    reconcileCompletedReadCalls(context, pendingReads, readLedger);
    const key = `${context.toolCall.name}\u0000${stableStringify(context.args)}`;
    const readKey = readAssetKey(context.toolCall.name, context.args);
    if (readKey) {
      if (!readLedger.claim(readKey.asset, readKey.key)) {
        return {
          block: true,
          reason:
            "detected_repetition：本轮已读取同一份 Resume/JD/Experience/workspace；" +
            "请使用已有结果推进当前 nextAction，不得再次读取。",
        };
      }
      if (typeof context.toolCall.id === "string") {
        pendingReads.set(context.toolCall.id, readKey);
      }
      return undefined;
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

function readAssetKey(
  toolName: string,
  args: unknown,
): { asset: ResumeReadAsset; key: string } | undefined {
  const asset = READ_ONCE_TOOLS[toolName];
  if (!asset) return undefined;
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { asset, key: `${toolName}\0${stableStringify(args)}` };
  }
  const record = args as Record<string, unknown>;
  const id = [
    "experienceId",
    "experience_id",
    "targetJdId",
    "jdId",
    "resumeId",
    "artifactId",
    "candidateId",
  ].map((key) => record[key]).find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return { asset, key: `${toolName}\0${id?.trim() ?? stableStringify(args)}` };
}

function reconcileCompletedReadCalls(
  context: BeforeToolCallContext,
  pendingReads: Map<string, { asset: ResumeReadAsset; key: string }>,
  ledger: { release(asset: ResumeReadAsset, key: string): void },
): void {
  for (const [toolCallId, read] of pendingReads) {
    const result = [...context.context.messages].reverse().find((entry) =>
      entry.role === "toolResult" && entry.toolCallId === toolCallId
    );
    if (!result) continue;
    if (isTransientToolResult(result)) ledger.release(read.asset, read.key);
    pendingReads.delete(toolCallId);
  }
}

function lastToolResultWasTransient(context: BeforeToolCallContext): boolean {
  const message = [...context.context.messages].reverse().find((entry) =>
    entry.role === "toolResult" && entry.toolName === context.toolCall.name
  );
  return isTransientToolResult(message);
}

function isTransientToolResult(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const result = message as { isError?: unknown; content?: unknown };
  return result.isError === true &&
    /timeout|timed out|temporar|econn|network|socket|429|502|503|504|rate.?limit/iu.test(
      JSON.stringify(result.content ?? ""),
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
