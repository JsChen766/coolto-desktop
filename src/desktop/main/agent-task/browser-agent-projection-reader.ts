import type { AgentTaskV1 } from "../../../agent-task/task-types.js";
import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import { browserAgentActionForTool } from "../../../browser/browser-agent-action-mapping.js";
import type {
  BrowserAgentCapability,
  BrowserAgentControl,
  BrowserAgentProjectionFacts,
} from "../../shared/types.js";

export interface BrowserAgentRuntimeFacts {
  control: BrowserAgentControl;
  currentAction: BrowserAgentProjectionFacts["currentAction"];
  modelActive: boolean;
  pageAccess: BrowserAgentProjectionFacts["pageAccess"];
  review: BrowserAgentProjectionFacts["review"];
}

export async function readBrowserAgentProjectionFacts(
  services: AgentHarnessServices,
  task: AgentTaskV1,
  runtime: BrowserAgentRuntimeFacts,
): Promise<BrowserAgentProjectionFacts | null> {
  const [active, receipts, events, decisions] = await Promise.all([
    services.grants.getActive(task.id),
    services.ledger.listReceipts(task.id),
    services.events.all(task.id),
    services.policyDecisions.list(task.id),
  ]);
  if (!active.grant?.allowedActions.some((action) => action.startsWith("browser."))) {
    return null;
  }
  const activity: BrowserAgentProjectionFacts["activity"] = [
    ...events.slice(-10).map((event) => ({
      kind: "event" as const,
      code: event.type === "user.takeover" ? "takeover" as const
        : event.type === "user.returned_control" ? "return_control" as const
          : "task_event" as const,
      actionKind: null,
      origin: null,
      occurredAt: event.receivedAt,
    })),
    ...decisions.filter((decision) => decision.decision !== "allow").slice(-10)
      .map((decision) => ({
        kind: "policy" as const,
        code: decision.decision === "ask"
          ? "policy_requires_user" as const : "policy_blocked" as const,
        actionKind: null,
        origin: null,
        occurredAt: decision.decidedAt,
      })),
    ...receipts.slice(-10).map((receipt) => ({
      kind: "receipt" as const,
      code: receiptCode(receipt.status),
      actionKind: browserAgentActionForTool(receipt.toolName).kind,
      origin: receipt.targetOrigin,
      occurredAt: receipt.createdAt,
    })),
  ];
  const control = controlFromEvents(events, runtime.control);
  const expiry = Date.parse(active.grant.expiresAt);
  const grantUsable = !active.revocation && Number.isFinite(expiry) && expiry > Date.now();
  return {
    task: {
      goal: task.goal,
      status: task.status,
      waitingReason: task.waiting?.reason ?? null,
      updatedAt: task.updatedAt,
    },
    ...runtime,
    currentAction: control === "agent" && grantUsable ? runtime.currentAction : null,
    commandError: null,
    commandPending: false,
    control,
    delegation: active.grant ? {
      domains: active.grant.allowedDomains,
      capabilities: grantCapabilities(active.grant.allowedActions),
      unattended: active.grant.unattended,
      expiresAt: active.grant.expiresAt,
      revokedAt: active.revocation?.revokedAt ?? null,
    } : null,
    activity,
  };
}

function controlFromEvents(
  events: Awaited<ReturnType<AgentHarnessServices["events"]["all"]>>,
  fallback: BrowserAgentControl,
): BrowserAgentControl {
  const controlEvent = [...events].reverse().find((event) =>
    event.type === "user.takeover" || event.type === "user.returned_control");
  if (!controlEvent) return fallback;
  return controlEvent.type === "user.takeover" ? "user" : "agent";
}

function grantCapabilities(actions: string[]): BrowserAgentCapability[] {
  const values: BrowserAgentCapability[] = [];
  for (const capability of ["read", "control", "write", "download", "submit"] as const) {
    if (actions.includes(`browser.${capability}`)) values.push(capability);
  }
  return values;
}

function receiptCode(status: string): BrowserAgentProjectionFacts["activity"][number]["code"] {
  if (status === "succeeded") return "action_succeeded";
  if (status === "partial") return "action_partial";
  if (status === "blocked") return "action_blocked";
  if (status === "uncertain") return "action_uncertain";
  return "action_failed";
}
