import type { AgentHarnessServices } from "../agent-task/agent-harness-services.js";
import type { DelegationGrantV1 } from "../agent-task/grant-types.js";
import type { AgentTaskV1 } from "../agent-task/task-types.js";

export type InboxTaskScope =
  | "mail.read"
  | "mail.classify"
  | "tracker.application.read";

export async function requireInboxTaskAccess(
  conversationId: string,
  harness: AgentHarnessServices,
  scope: InboxTaskScope,
): Promise<{ task: AgentTaskV1; grant: DelegationGrantV1 }> {
  const task = await harness.tasks.findRunningByConversation(conversationId);
  if (!task?.activeRunId) throw new Error("Inbox Signals 需要 running AgentTask");
  const active = await harness.grants.getActive(task.id);
  if (!active.grant || active.revocation ||
      !active.grant.allowedActions.includes(scope)) {
    throw new Error(`DelegationGrant 未授权 ${scope}`);
  }
  return { task, grant: active.grant };
}
