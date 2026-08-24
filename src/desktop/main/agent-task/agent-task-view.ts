import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import type { AgentTaskV1 } from "../../../agent-task/task-types.js";
import type {
  AgentTaskDetailView,
  AgentTaskActivityView,
  AgentTaskLeadView,
  AgentTaskReceiptView,
  AgentTaskView,
} from "../../shared/types.js";

export function toAgentTaskView(task: AgentTaskV1): AgentTaskView {
  return {
    id: task.id,
    conversationId: task.conversationId,
    goal: task.goal,
    status: task.status,
    waitingReason: task.waiting?.reason ?? null,
    activeRunId: task.activeRunId,
    grantId: task.grantId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    terminalAt: task.terminalAt,
  };
}

export async function listAgentTaskViews(
  services: AgentHarnessServices,
): Promise<AgentTaskView[]> {
  return (await services.tasks.list()).map(toAgentTaskView);
}

export async function readAgentTaskDetail(
  services: AgentHarnessServices,
  taskId: string,
): Promise<AgentTaskDetailView> {
  const [task, active, receipts, events, decisions, leads, evaluations] = await Promise.all([
    services.tasks.get(taskId),
    services.grants.getActive(taskId),
    services.ledger.listReceipts(taskId),
    services.events.all(taskId),
    services.policyDecisions.list(taskId),
    services.leads.list(taskId, true),
    services.leads.latestEvaluations(taskId),
  ]);
  return {
    task: toAgentTaskView(task),
    grant: active.grant
      ? {
          id: active.grant.id,
          allowedDomains: active.grant.allowedDomains,
          blockedDomains: active.grant.blockedDomains,
          allowedActions: active.grant.allowedActions,
          unattended: active.grant.unattended,
          expiresAt: active.grant.expiresAt,
          revokedAt: active.revocation?.revokedAt ?? null,
        }
      : null,
    receipts: receipts.map((receipt): AgentTaskReceiptView => ({
      id: receipt.id,
      toolName: receipt.toolName,
      status: receipt.status,
      targetOrigin: receipt.targetOrigin,
      errorCode: receipt.errorCode,
      evidenceCount: receipt.evidenceRefs.length,
      createdAt: receipt.createdAt,
    })),
    activity: [
      ...events.map((event): AgentTaskActivityView => ({
        id: event.id, kind: "event", title: event.type,
        detail: `${event.source} · ${event.trust}`,
        status: event.status, occurredAt: event.receivedAt,
      })),
      ...decisions.map((decision): AgentTaskActivityView => ({
        id: `${decision.toolCallId}:${decision.decidedAt}`, kind: "policy",
        title: decision.reasonCode, detail: decision.toolCallId,
        status: decision.decision, occurredAt: decision.decidedAt,
      })),
      ...receipts.map((receipt): AgentTaskActivityView => ({
        id: receipt.id, kind: "receipt", title: receipt.toolName,
        detail: receipt.errorCode ?? receipt.targetOrigin ?? "动作回执",
        status: receipt.status, occurredAt: receipt.createdAt,
      })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    leads: leads.map((lead): AgentTaskLeadView => {
      const evaluation = evaluations.find((value) => value.leadId === lead.id);
      return {
        id: lead.id, company: lead.company, role: lead.role,
        location: lead.location, targetUrl: lead.targetUrl, state: lead.state,
        score: evaluation?.score ?? null,
        shortlisted: evaluation?.shortlisted ?? false,
        rationale: evaluation?.rationale ?? null,
      };
    }).sort((a, b) => Number(b.shortlisted) - Number(a.shortlisted) ||
      (b.score ?? -1) - (a.score ?? -1)),
  };
}
