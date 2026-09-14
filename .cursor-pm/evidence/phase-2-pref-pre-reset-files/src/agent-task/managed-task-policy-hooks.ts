import type { AfterToolCallContext, BeforeToolCallContext, BeforeToolCallResult } from "@earendil-works/pi-agent-core";

import type { BrowserAgentController } from "../browser/agent-control-types.js";
import type { CapabilityAgentTool } from "../tools/tool-capabilities.js";
import { requireToolCapability } from "../tools/tool-capabilities.js";
import { canonicalHash } from "./canonical-hash.js";
import { evaluateDelegationPolicy } from "./delegation-policy.js";
import type { AgentHarnessServices } from "./agent-harness-services.js";
import type { PolicyDecisionV1 } from "./grant-types.js";
import type { ActionTokenV1 } from "./receipt-types.js";
import { ManagedTaskExecutionState } from "./managed-task-execution-state.js";
import { constrainManagedReadSurface } from "./managed-task-read-surface.js";
import { managedTaskTargetContext, toManagedTaskJson } from "./managed-task-target-context.js";
import {
  advanceTaskStageAfterAction,
  advanceTaskStageAfterObservation,
} from "./task-stage-runtime.js";

const TERMINAL_TOOLS = new Set(["task_wait", "task_need_user", "task_complete"]);
const BROWSER_ACCESS_SCOPES = new Set([
  "browser.control", "browser.write", "browser.download", "browser.submit",
]);

export interface ManagedTaskPolicyHooksOptions {
  conversationId: string;
  services: AgentHarnessServices;
  browser: BrowserAgentController;
  tools: CapabilityAgentTool[];
  sitePolicyAllows: (origin: string | null, toolName: string) => boolean;
  grantBrowserAccess?: (reason: string) => void;
  revokeBrowserAccess?: (reason: string) => void;
}

export class ManagedTaskPolicyHooks {
  readonly #tools: Map<string, CapabilityAgentTool>;
  readonly #execution: ManagedTaskExecutionState;

  public constructor(private readonly options: ManagedTaskPolicyHooksOptions) {
    this.#tools = new Map(options.tools.map((tool) => [tool.name, tool]));
    this.#execution = new ManagedTaskExecutionState(
      options.conversationId, options.services, options.browser,
    );
  }

  public beforeToolCall = async (
    context: BeforeToolCallContext,
  ): Promise<BeforeToolCallResult | undefined> => {
    const task = await this.options.services.tasks.findRunningByConversation(
      this.options.conversationId,
    );
    if (!task?.activeRunId) return undefined;
    this.#execution.resetForTask(task.id);
    if (this.#execution.takeoverBlocked() &&
        context.toolCall.name !== "browser_recruiting_form_observe" &&
        !TERMINAL_TOOLS.has(context.toolCall.name)) {
      const reason = this.#execution.takeoverStatus() === "invalidated"
        ? "招聘页面接管上下文已失效，请重新授权或创建任务"
        : "招聘页面正在等待用户接管，模型观察和写入已暂停";
      return { block: true, reason };
    }
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
    const run = await this.options.services.tasks.getActiveRun(task.id);
    const { grant, revocation } = await this.options.services.grants.getActive(task.id);
    const target = managedTaskTargetContext(
      this.options.browser, context.toolCall.name, context.args,
    );
    const observation = this.#execution.observation(
      task.activeRunId, target.tabId, target.url,
    );
    const stage = this.options.services.stages.current(task.id, task.activeRunId);
    const observationHash = observation.hash;
    const requestHash = canonicalHash(toManagedTaskJson({
      taskId: task.id,
      runId: task.activeRunId,
      toolName: context.toolCall.name,
      args: context.args,
      targetOrigin: target.origin,
      tabId: target.tabId,
      observationHash,
      currentStage: stage?.stage ?? null,
      stageTransitionId: stage?.transitionId ?? null,
      grantHash: grant?.contentHash ?? null,
    }));
    const policy = {
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
      unattended: run.wakeCause !== "user",
      freshObservation: !metadata.requiresFreshObservation || Boolean(observationHash),
      sitePolicyAllowed: this.options.sitePolicyAllows(
        target.origin,
        context.toolCall.name,
      ),
      ...(stage ? { currentStage: stage.stage, stageTransitionId: stage.transitionId } : {}),
    };
    const decision = constrainManagedReadSurface({
      browser: this.options.browser,
      decision: evaluateDelegationPolicy(policy),
      policy,
      sitePolicyAllows: this.options.sitePolicyAllows,
      toolName: context.toolCall.name,
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
    let token: ActionTokenV1 | null = null;
    if (metadata.sideEffect !== "read" && metadata.evidence === "action_receipt" && grant) {
      token = await this.options.services.ledger.issue({
        ownerId: task.ownerId, taskId: task.id, runId: task.activeRunId,
        toolName: context.toolCall.name, requestHash,
        grantHash: grant.contentHash, targetOrigin: target.origin,
        tabId: target.tabId, observationHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      decision.actionTokenId = token.id;
    }
    if (!await this.#execution.isActive(task.id, task.activeRunId)) {
      await this.#recordBlock(task.id, context.toolCall.id, decision, token,
        "run_inactive_before_execution");
      return { block: true, reason: "AgentRun 已结束或已被用户接管" };
    }
    const needsBrowserAccess = metadata.requiredScopes.some(
      (scope) => BROWSER_ACCESS_SCOPES.has(scope),
    );
    let accessOpened = false;
    if (needsBrowserAccess) {
      try {
        this.options.grantBrowserAccess?.(`DelegationGrant ${grant?.id ?? ""}`);
        accessOpened = Boolean(this.options.grantBrowserAccess);
      } catch (error) {
        this.options.revokeBrowserAccess?.("browser_access_unavailable");
        await this.#recordBlock(task.id, context.toolCall.id, decision, token,
          "browser_access_unavailable");
        return {
          block: true,
          reason: error instanceof Error ? error.message : "浏览器控制不可用",
        };
      }
    }
    let recorded: boolean;
    try {
      recorded = await this.options.services.policyDecisions.recordIfActiveRun(
        task.id, task.activeRunId, decision,
      );
    } catch (error) {
      if (accessOpened) this.options.revokeBrowserAccess?.("policy_record_failed");
      throw error;
    }
    if (!recorded) {
      if (accessOpened) this.options.revokeBrowserAccess?.("run_inactive_before_execution");
      await this.#recordBlock(task.id, context.toolCall.id, decision, token,
        "run_inactive_before_execution");
      return { block: true, reason: "AgentRun 已结束或已被用户接管" };
    }
    this.#execution.start(context.toolCall.id, {
      taskId: task.id, runId: task.activeRunId, toolName: context.toolCall.name,
    });
    if (token) {
      this.#execution.bindAction(context.toolCall.id, token, observation.evidenceRef);
    }
    this.options.services.runtimeProjection.start({
      callId: context.toolCall.id,
      runId: task.activeRunId,
      startedAt: new Date().toISOString(),
      tabId: target.tabId,
      targetOrigin: target.origin,
      taskId: task.id,
      toolName: context.toolCall.name,
    });
    return undefined;
  };

  public afterToolCall = async (
    context: AfterToolCallContext,
  ): Promise<undefined> => {
    const wasTakeoverBlocked = this.#execution.takeoverBlocked();
    try {
      const receiptRecorded = await this.#execution.after(context);
      await advanceTaskStageAfterObservation(
        this.options.services, this.options.conversationId,
        context.toolCall.name, context.isError,
      );
      await advanceTaskStageAfterAction(
        this.options.services, this.options.conversationId, receiptRecorded,
      );
      const takeover = this.#execution.takeoverStatus();
      if (takeover !== "agent" && !wasTakeoverBlocked) {
        this.options.revokeBrowserAccess?.(`recruiting_form_${takeover}`);
      }
      return undefined;
    } finally {
      this.options.services.runtimeProjection.finish(context.toolCall.id);
    }
  };


  async #recordBlock(
    taskId: string,
    toolCallId: string,
    decision: PolicyDecisionV1,
    token: ActionTokenV1 | null,
    reasonCode: string,
  ): Promise<void> {
    decision.decision = "block";
    decision.reasonCode = reasonCode;
    decision.decidedAt = new Date().toISOString();
    if (token) await this.#execution.rejectAction(token, toolCallId, reasonCode);
    await this.options.services.policyDecisions.record(taskId, decision);
  }
}
