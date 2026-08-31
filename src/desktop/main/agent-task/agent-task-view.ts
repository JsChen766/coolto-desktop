import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import type { AgentTaskV1 } from "../../../agent-task/task-types.js";
import type { JsonValue } from "../../../agent-task/json-types.js";
import type {
  AgentTaskDetailView,
  AgentTaskActivityView,
  AgentTaskLeadView,
  AgentTaskReceiptView,
  AgentTaskView,
  AgentTaskLoopSummary,
  AgentTaskArtifactView,
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
  const [task, active, receipts, events, decisions, leads, evaluations, artifacts] = await Promise.all([
    services.tasks.get(taskId),
    services.grants.getActive(taskId),
    services.ledger.listReceipts(taskId),
    services.events.all(taskId),
    services.policyDecisions.list(taskId),
    services.leads.list(taskId, true),
    services.leads.latestEvaluations(taskId),
    services.aiNativeArtifacts.list(taskId),
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
          loop: loopSummary(active.grant),
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
    artifacts: artifacts.map(toArtifactView),
  };
}

function toArtifactView(
  value: import("../../../agent-task/ai-native-artifact-types.js").AiNativeArtifactV1,
): AgentTaskArtifactView {
  if (value.kind === "follow_up_draft") return {
    id: value.id, kind: value.kind, title: value.subject,
    summary: `计划于 ${value.scheduledFor} 跟进`, applicationId: value.applicationId,
    createdAt: value.createdAt, detail: {
      body: value.body, scheduledFor: value.scheduledFor, timezone: value.timezone,
    },
  };
  if (value.kind === "interview_brief") return {
    id: value.id, kind: value.kind, title: value.title,
    summary: `${value.sections.length} 个准备主题`, applicationId: value.applicationId,
    createdAt: value.createdAt, detail: { sections: value.sections },
  };
  if (value.kind === "strategy_proposal") return {
    id: value.id, kind: value.kind, title: value.title,
    summary: value.summary, applicationId: null, createdAt: value.createdAt,
    detail: { recommendations: value.recommendations, caveat: value.caveat },
  };
  return {
    id: value.id, kind: value.kind, title: value.title,
    summary: value.rationale, applicationId: value.applicationId,
    createdAt: value.createdAt, detail: {
      severity: value.severity, rationale: value.rationale,
      evidenceQuotes: value.evidenceQuotes, deadlineAt: value.deadlineAt,
    },
  };
}

function loopSummary(
  grant: import("../../../agent-task/grant-types.js").DelegationGrantV1,
): AgentTaskLoopSummary | null {
  const kind = grant.jobCriteria.loopKind ?? grant.connectorPolicy?.loopKind;
  if (kind === "resume_job_apply") {
    const sources = Array.isArray(grant.jobCriteria.sources)
      ? grant.jobCriteria.sources : [];
    return {
      kind,
      resumeTitle: typeof grant.assetPolicy.resumeTitle === "string"
        ? grant.assetPolicy.resumeTitle : "已选简历",
      sources: sources.flatMap((source) => source && typeof source === "object" &&
        !Array.isArray(source) && typeof source.company === "string"
        ? [source.company] : []),
    };
  }
  if (kind === "mail_app_schedule") {
    const directions = Array.isArray(grant.connectorPolicy?.scheduleMailDirections)
      ? grant.connectorPolicy.scheduleMailDirections.filter(
        (value): value is "received" | "sent" => value === "received" || value === "sent",
      ) : [];
    const connections = grant.connectorPolicy?.mailConnectionIds;
    return {
      kind, directions,
      pollIntervalMinutes: typeof grant.connectorPolicy?.pollIntervalMinutes === "number"
        ? grant.connectorPolicy.pollIntervalMinutes : 15,
      connections: Array.isArray(connections) ? connections.length : 0,
      browserWebmail: grant.connectorPolicy?.browserWebmail === true,
    };
  }
  if (kind === "application_follow_up") return {
    kind,
    applicationId: String(grant.assetPolicy.applicationId ?? ""),
    checkIntervalHours: numberPolicy(grant.connectorPolicy?.checkIntervalHours, 24),
  };
  if (kind === "interview_briefing") return {
    kind,
    applicationId: String(grant.assetPolicy.applicationId ?? ""),
    interviewId: String(grant.connectorPolicy?.interviewId ?? ""),
    wakeBeforeMinutes: numberPolicy(grant.connectorPolicy?.wakeBeforeMinutes, 1440),
  };
  if (kind === "application_strategy") return {
    kind,
    reviewIntervalDays: numberPolicy(grant.connectorPolicy?.reviewIntervalDays, 7),
  };
  if (kind === "risk_deadline_watch") {
    const values = grant.connectorPolicy?.riskMailDirections;
    return {
      kind,
      directions: Array.isArray(values) ? values.filter(
        (item): item is "received" | "sent" => item === "received" || item === "sent",
      ) : [],
      pollIntervalMinutes: numberPolicy(grant.connectorPolicy?.pollIntervalMinutes, 15),
    };
  }
  return null;
}

function numberPolicy(value: JsonValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
