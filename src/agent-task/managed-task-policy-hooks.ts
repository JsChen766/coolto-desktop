import type {
  AfterToolCallContext,
  BeforeToolCallContext,
  BeforeToolCallResult,
} from "@earendil-works/pi-agent-core";

import type { BrowserAgentController } from "../browser/agent-control-types.js";
import type { CapabilityAgentTool } from "../tools/tool-capabilities.js";
import { requireToolCapability } from "../tools/tool-capabilities.js";
import { canonicalHash } from "./canonical-hash.js";
import { evaluateDelegationPolicy } from "./delegation-policy.js";
import type { AgentHarnessServices } from "./agent-harness-services.js";
import type { ActionTokenV1 } from "./receipt-types.js";
import type { JsonValue } from "./json-types.js";

interface PendingAction {
  token: ActionTokenV1;
  targetOrigin: string | null;
  tabId: string | null;
  observationHash: string | null;
  evidenceRef: string | null;
}

const TERMINAL_TOOLS = new Set(["task_wait", "task_need_user", "task_complete"]);

export interface ManagedTaskPolicyHooksOptions {
  conversationId: string;
  services: AgentHarnessServices;
  browser: BrowserAgentController;
  tools: CapabilityAgentTool[];
  sitePolicyAllows: (origin: string | null, toolName: string) => boolean;
  grantBrowserAccess?: (reason: string) => void;
}

export class ManagedTaskPolicyHooks {
  readonly #tools: Map<string, CapabilityAgentTool>;
  readonly #pending = new Map<string, PendingAction>();
  readonly #observations = new Map<string, {
    url: string | null;
    hash: string;
    observedAt: number;
    evidenceRef: string | null;
  }>();

  public constructor(private readonly options: ManagedTaskPolicyHooksOptions) {
    this.#tools = new Map(options.tools.map((tool) => [tool.name, tool]));
  }

  public beforeToolCall = async (
    context: BeforeToolCallContext,
  ): Promise<BeforeToolCallResult | undefined> => {
    const task = await this.options.services.tasks.findRunningByConversation(
      this.options.conversationId,
    );
    if (!task?.activeRunId) return undefined;
    const calls = context.assistantMessage.content.filter((part) => part.type === "toolCall");
    if (calls.length > 1 && calls.some((call) => TERMINAL_TOOLS.has(call.name))) {
      return {
        block: true,
        reason: "task terminal tool 必须是本条 assistant message 的唯一工具调用",
        terminate: true,
      };
    }
    const tool = this.#tools.get(context.toolCall.name);
    if (!tool) return { block: true, reason: "工具未在当前 Task Harness 注册" };
    const metadata = requireToolCapability(tool);
    const { grant, revocation } = await this.options.services.grants.getActive(task.id);
    const target = targetContext(this.options.browser, context.toolCall.name, context.args);
    const observationHash = this.#freshObservation(target.tabId, target.url);
    const evidenceRef = this.#freshEvidenceRef(target.tabId, target.url);
    const requestHash = canonicalHash(toJson({
      taskId: task.id,
      runId: task.activeRunId,
      toolName: context.toolCall.name,
      args: context.args,
      targetOrigin: target.origin,
      tabId: target.tabId,
      observationHash,
    }));
    const decision = evaluateDelegationPolicy({
      ownerId: task.ownerId,
      taskId: task.id,
      runId: task.activeRunId,
      toolCallId: context.toolCall.id,
      taskGoalHash: task.goalHash,
      requestHash,
      targetOrigin: target.origin,
      metadata,
      grant,
      revocation,
      unattended: (await this.options.services.tasks.getActiveRun(task.id)).wakeCause !== "user",
      freshObservation: !metadata.requiresFreshObservation || Boolean(observationHash),
      sitePolicyAllowed: this.options.sitePolicyAllows(
        target.origin,
        context.toolCall.name,
      ),
    });
    if (decision.decision !== "allow") {
      await this.options.services.policyDecisions.record(task.id, decision);
      if (metadata.evidence !== "none") {
        await this.options.services.ledger.record({
          taskId: task.id, runId: task.activeRunId,
          toolCallId: context.toolCall.id, toolName: context.toolCall.name,
          requestHash, targetOrigin: target.origin, status: "blocked",
          observationBeforeHash: observationHash,
          errorCode: decision.reasonCode,
        });
      }
      return {
        block: true,
        reason: decision.decision === "ask"
          ? `需要用户确认：${decision.reasonCode}`
          : `Harness 已阻止：${decision.reasonCode}`,
      };
    }
    if (metadata.requiredScopes.some((scope) =>
      ["browser.control", "browser.write", "browser.download", "browser.submit"]
        .includes(scope))) {
      try {
        this.options.grantBrowserAccess?.(`DelegationGrant ${grant?.id ?? ""}`);
      } catch (error) {
        decision.decision = "block";
        decision.reasonCode = "browser_access_unavailable";
        await this.options.services.policyDecisions.record(task.id, decision);
        await this.options.services.ledger.record({
          taskId: task.id, runId: task.activeRunId,
          toolCallId: context.toolCall.id, toolName: context.toolCall.name,
          requestHash, targetOrigin: target.origin, status: "blocked",
          observationBeforeHash: observationHash,
          errorCode: "browser_access_unavailable",
        });
        return {
          block: true,
          reason: error instanceof Error ? error.message : "浏览器控制不可用",
        };
      }
    }
    if (metadata.sideEffect !== "read" && metadata.evidence === "action_receipt" && grant) {
      const token = await this.options.services.ledger.issue({
        ownerId: task.ownerId, taskId: task.id, runId: task.activeRunId,
        toolName: context.toolCall.name, requestHash,
        grantHash: grant.contentHash, targetOrigin: target.origin,
        tabId: target.tabId, observationHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      decision.actionTokenId = token.id;
      this.#pending.set(context.toolCall.id, {
        token, targetOrigin: target.origin, tabId: target.tabId,
        observationHash, evidenceRef,
      });
    }
    await this.options.services.policyDecisions.record(task.id, decision);
    return undefined;
  };

  public afterToolCall = async (
    context: AfterToolCallContext,
  ): Promise<undefined> => {
    if (context.toolCall.name === "browser_snapshot" && !context.isError) {
      const evidenceRef = await this.#saveObservation(context);
      this.#recordObservation(context.result.details, evidenceRef);
    }
    const pending = this.#pending.get(context.toolCall.id);
    if (!pending) return undefined;
    this.#pending.delete(context.toolCall.id);
    await this.options.services.ledger.consume({
      tokenId: pending.token.id,
      toolCallId: context.toolCall.id,
      targetOrigin: pending.targetOrigin,
      tabId: pending.tabId,
      observationHash: pending.observationHash,
      status: context.isError ? "failed" : "succeeded",
      observationAfterHash: this.#activeObservationHash(),
      errorCode: context.isError ? "tool_execution_failed" : null,
      evidenceRefs: pending.evidenceRef ? [pending.evidenceRef] : [],
    });
    return undefined;
  };

  #recordObservation(details: unknown, evidenceRef: string | null): void {
    if (!details || typeof details !== "object") return;
    const tab = (details as { tab?: { id?: unknown; url?: unknown } }).tab;
    if (typeof tab?.id !== "string") return;
    this.#observations.set(tab.id, {
      url: typeof tab.url === "string" ? tab.url : null,
      hash: canonicalHash(toJson(details)),
      observedAt: Date.now(),
      evidenceRef,
    });
  }

  #freshObservation(tabId: string | null, url: string | null): string | null {
    if (!tabId) return null;
    const value = this.#observations.get(tabId);
    return value && value.url === url && Date.now() - value.observedAt <= 30_000
      ? value.hash : null;
  }

  #activeObservationHash(): string | null {
    const tab = this.options.browser.getActiveTab();
    return tab ? this.#freshObservation(tab.id, tab.url) : null;
  }

  #freshEvidenceRef(tabId: string | null, url: string | null): string | null {
    if (!tabId) return null;
    const value = this.#observations.get(tabId);
    return value && value.url === url && Date.now() - value.observedAt <= 30_000
      ? value.evidenceRef : null;
  }

  async #saveObservation(context: AfterToolCallContext): Promise<string | null> {
    const evidence = this.options.services.evidence;
    if (!evidence) return null;
    const task = await this.options.services.tasks.findRunningByConversation(
      this.options.conversationId,
    );
    if (!task?.activeRunId) return null;
    const payload = toJson({ content: context.result.content, details: context.result.details });
    const createdAt = new Date().toISOString();
    const saved = await evidence.save({
      taskId: task.id, runId: task.activeRunId, kind: "browser_observation",
      payloadHash: canonicalHash(payload), payload, createdAt,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    return saved.id;
  }
}

function targetContext(
  browser: BrowserAgentController,
  toolName: string,
  args: unknown,
): { tabId: string | null; url: string | null; origin: string | null } {
  const usesBrowserContext = toolName.startsWith("browser_") ||
    ["extract_page", "request_write_access", "prepare_application_submission", "capture_browser_mail_event"]
      .includes(toolName);
  if (!usesBrowserContext) return { tabId: null, url: null, origin: null };
  const active = browser.getActiveTab();
  const requestedUrl = ["browser_navigate", "browser_new_tab", "browser_download"]
    .includes(toolName) && args && typeof args === "object" &&
    typeof (args as { url?: unknown }).url === "string"
      ? (args as { url: string }).url : null;
  const url = requestedUrl ?? active?.url ?? null;
  let origin: string | null = null;
  try { origin = url ? new URL(url).origin : null; } catch { origin = null; }
  return { tabId: active?.id ?? null, url: active?.url ?? null, origin };
}

function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue; }
