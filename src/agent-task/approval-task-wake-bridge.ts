import type { ApprovalManager } from "../approvals/approval-manager.js";
import type { ApprovalEvent } from "../approvals/types.js";
import type { AgentHarnessServices } from "./agent-harness-services.js";
import { canonicalHash } from "./canonical-hash.js";

/** Converts completed user approval decisions into generic AgentTask wake events. */
export function bindApprovalTaskWake(
  approvals: ApprovalManager,
  conversationId: string,
  services: AgentHarnessServices,
): () => void {
  const requestTasks = new Map<string, string>();
  return approvals.subscribe(async (event) => {
    if (event.type === "approval.required") {
      const task = await services.tasks.findRunningByConversation(conversationId);
      if (task) requestTasks.set(event.request.id, task.id);
      return;
    }
    const decision = wakeDecision(event);
    if (!("requestId" in event)) return;
    const taskId = requestTasks.get(event.requestId);
    if (!decision || !taskId) {
      if (event.type === "approval.failed" ||
          event.type === "approval.resolved" && event.decision !== "accept") {
        requestTasks.delete(event.requestId);
      }
      return;
    }
    requestTasks.delete(event.requestId);
    const task = await services.tasks.get(taskId).catch(() => null);
    if (!task || task.conversationId !== conversationId ||
        !["running", "waiting"].includes(task.status) ||
        task.status === "waiting" && task.waiting?.reason !== "approval") return;
    await services.events.enqueue({
      taskId: task.id, source: "approval", type: `approval.${decision}`,
      trust: "trusted_system", occurredAt: new Date().toISOString(),
      dedupeKey: `approval:${event.requestId}:${decision}`,
      payloadRef: null,
      payloadHash: canonicalHash({ requestId: event.requestId, decision }),
    });
  });
}

function wakeDecision(event: ApprovalEvent): "accepted" | "rejected" | null {
  if (event.type === "approval.completed") return "accepted";
  if (event.type === "approval.resolved" && event.decision === "reject") {
    return "rejected";
  }
  return null;
}
