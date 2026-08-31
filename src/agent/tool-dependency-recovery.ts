import type {
  AfterToolCallContext,
  AfterToolCallResult,
} from "@earendil-works/pi-agent-core";

const JD_REUSE_TOOL = "find_resume_reuse_candidates";
const JD_SEARCH_TOOL = "search_jds";

/** Converts one same-batch unresolved read dependency into a normal Pi result. */
export function recoverDeferredToolDependency(
  context: AfterToolCallContext,
): AfterToolCallResult | undefined {
  if (!context.isError || context.toolCall.name !== JD_REUSE_TOOL) {
    return undefined;
  }
  const targetJdId = stringField(context.args, "targetJdId");
  const deferred = deferredJdDependencyResult(targetJdId);
  if (!deferred || !assistantCalls(context, JD_SEARCH_TOOL)) {
    return undefined;
  }
  return { ...deferred, isError: false };
}

/** Fast path for tools: avoid sync/storage reads for a model placeholder. */
export function deferredJdDependencyResult(targetJdId: string) {
  if (!isPendingReference(targetJdId.trim())) return undefined;
  const details = {
    status: "deferred_dependency",
    dependency: JD_SEARCH_TOOL,
    retryTool: JD_REUSE_TOOL,
    instruction:
      "等待本批 search_jds 结果；下一轮必须从其成功结果复制真实 JD ID，再调用 find_resume_reuse_candidates。不得继续使用占位 ID。",
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(details) }],
    details,
  };
}

function assistantCalls(
  context: AfterToolCallContext,
  toolName: string,
): boolean {
  return context.assistantMessage.content.some((part) =>
    part.type === "toolCall" && part.name === toolName
  );
}

function stringField(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field.trim() : "";
}

function isPendingReference(value: string): boolean {
  return /^_+pending_+$/iu.test(value) || /^(?:pending|tbd|unknown)$/iu.test(value);
}
