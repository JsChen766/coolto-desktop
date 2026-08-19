import type { ShouldStopAfterTurnContext } from "@earendil-works/pi-agent-core";

const RESUME_WORKSPACE_TOOLS = new Set([
  "create_resume_workspace",
  "get_resume_workspace",
  "apply_resume_content",
  "add_resume_material",
]);

/** A ready workspace is authoritative; no further model turn may rewrite it. */
export function hasAuthoritativeResumeCompletion(
  context: ShouldStopAfterTurnContext,
): boolean {
  return context.toolResults.some((result) => {
    if (!RESUME_WORKSPACE_TOOLS.has(result.toolName)) return false;
    const details = record(result.details);
    const readiness = record(details?.readiness);
    const nextAction = record(details?.nextAction);
    return details?.status === "ready_for_approval" &&
      readiness?.ready === true && nextAction?.mode === "stop";
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

