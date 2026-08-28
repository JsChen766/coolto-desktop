import type {
  AgentMessage,
  AgentTool,
  AfterToolCallContext,
  AfterToolCallResult,
  BeforeToolCallContext,
  BeforeToolCallResult,
  ShouldStopAfterTurnContext,
  StreamFn,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { randomUUID } from "node:crypto";
import {
  createModels,
  type Api,
  type Model,
  type Models,
  type MutableModels,
} from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";

import { ApprovalManager } from "../approvals/approval-manager.js";
import { createToolRegistry } from "../tools/registry.js";
import { CooltoAgent } from "./coolto-agent.js";
import { compactResumeGenerationContext, stripThinkingParts } from "./context-policy.js";
import { COOLTO_SYSTEM_PROMPT } from "./system-prompt.js";
import { createTurnGovernor } from "./turn-governor.js";
import { createRepetitionGuard } from "./repetition-guard.js";
import { hasAuthoritativeResumeCompletion } from "./terminal-resume-result.js";
import type { OutputRepetitionReason } from "./output-repetition-guard.js";
import type { TurnGovernorStopReason } from "./turn-governor.js";
import { recoverDeferredToolDependency } from
  "./tool-dependency-recovery.js";

export const DEFAULT_MODEL_ID = "deepseek-v4-flash";
export const DEFAULT_PROVIDER_ID = "deepseek";
export const AGENT_TEMPERATURE = 0.1;

export interface CreateAgentOptions {
  apiKey?: string;
  modelId?: string;
  systemPrompt?: string;
  tools?: AgentTool[];
  thinkingLevel?: ThinkingLevel;
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>;
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>;
  transformContext?: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>;
  shouldStopAfterTurn?: (
    context: ShouldStopAfterTurnContext,
    signal?: AbortSignal,
  ) => boolean | Promise<boolean>;
  automaticFollowUp?: (
    promptSequence: number,
    message: AgentMessage,
  ) => string | {
    instruction: string;
    requireToolCall: boolean;
  } | undefined;
  outputRepetitionRecovery?: (
    promptSequence: number,
    reason: OutputRepetitionReason,
  ) => string | undefined;
  turnGovernorRecovery?: (
    promptSequence: number,
    reason: TurnGovernorStopReason,
  ) => string | undefined;
  approvalManager?: ApprovalManager;
}
export interface AgentDependencies {
  model: Model<Api>;
  streamFn: StreamFn;
  /** Models registry; exposed for context compaction (summary generation). */
  models?: Models;
}

export interface CreditGatewayOptions {
  baseUrl: string;
  operationType: string;
  getSessionToken: () => string;
  createRequestId?: () => string;
}

export function createDeepSeekDependencies(
  modelId = DEFAULT_MODEL_ID,
  gateway?: CreditGatewayOptions,
): AgentDependencies {
  const models: MutableModels = createModels();
  models.setProvider(deepseekProvider());

  const registeredModel = models.getModel(DEFAULT_PROVIDER_ID, modelId);
  if (!registeredModel) {
    const available = models
      .getModels(DEFAULT_PROVIDER_ID)
      .map((candidate) => candidate.id)
      .join(", ");
    throw new Error(
      `未知的 DeepSeek 模型 "${modelId}"。可用模型：${available || "无"}`,
    );
  }

  const model = gateway
    ? {
        ...registeredModel,
        baseUrl: `${gateway.baseUrl.replace(/\/+$/u, "")}/api/llm`,
      }
    : registeredModel;

  const baseStream = models.streamSimple.bind(models);
  return {
    model,
    models,
    streamFn: (modelInput, context, options) => {
      // 不设置产品固定输出上限：pi-ai 按模型声明的物理容量生成请求额度，
      // Credit 网关再按本次剩余余额动态收窄 max_tokens。
      const streamOptions = { ...options, temperature: AGENT_TEMPERATURE };
      if (!gateway) {
        return baseStream(modelInput, context, streamOptions);
      }
      const originalPayloadTransform = options?.onPayload;
      return baseStream(modelInput, context, {
        ...streamOptions,
        apiKey: "coolto-session-auth",
        headers: {
          ...options?.headers,
          Cookie: `access_token=${gateway.getSessionToken()}`,
        },
        onPayload: async (payload, payloadModel) => {
          const transformed =
            (await originalPayloadTransform?.(payload, payloadModel)) ?? payload;
          return withCreditMetadata(
            transformed,
            gateway.operationType,
            gateway.createRequestId?.() ?? randomUUID(),
          );
        },
      });
    },
  };
}

export function withCreditMetadata(
  payload: unknown,
  operationType: string,
  requestId: string,
): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("LLM 网关请求体必须是 JSON object");
  }
  return {
    ...payload,
    operation_type: operationType,
    request_id: requestId,
  };
}

export function createCooltoAgent(
  options: CreateAgentOptions = {},
  dependencies?: AgentDependencies,
): CooltoAgent {
  const runtime =
    dependencies ?? createDeepSeekDependencies(options.modelId);
  const defaultTurnGovernor = createTurnGovernor();
  const repetitionGuard = createRepetitionGuard();

  const agentOptions = {
    model: runtime.model,
    streamFn: runtime.streamFn,
    systemPrompt: options.systemPrompt ?? COOLTO_SYSTEM_PROMPT,
    tools: options.tools ?? createToolRegistry(),
    ...(options.thinkingLevel
      ? { thinkingLevel: options.thinkingLevel }
      : {}),
    ...(options.apiKey
      ? { getApiKey: () => options.apiKey }
      : {}),
    ...(options.beforeToolCall
      ? {
          beforeToolCall: async (
            context: BeforeToolCallContext,
            signal?: AbortSignal,
          ): Promise<BeforeToolCallResult | undefined> => {
            const userDecision = await options.beforeToolCall?.(context, signal);
            if (userDecision?.block) return userDecision;
            return repetitionGuard(context);
          },
        }
      : { beforeToolCall: repetitionGuard }),
    afterToolCall: async (
      context: AfterToolCallContext,
      signal?: AbortSignal,
    ): Promise<AfterToolCallResult | undefined> => {
      const configured = await options.afterToolCall?.(context, signal);
      const recovered = recoverDeferredToolDependency(context);
      return configured || recovered
        ? { ...configured, ...recovered }
        : undefined;
    },
    transformContext:
      options.transformContext ??
      (async (messages: AgentMessage[]) =>
        stripThinkingParts(await compactResumeGenerationContext(messages))),
    shouldStopAfterTurn: async (
      context: ShouldStopAfterTurnContext,
      signal?: AbortSignal,
    ) =>
      hasAuthoritativeResumeCompletion(context) ||
      Boolean(await options.shouldStopAfterTurn?.(context, signal)) ||
      defaultTurnGovernor.evaluate(context),
    turnGovernor: defaultTurnGovernor,
    ...(options.automaticFollowUp
      ? { automaticFollowUp: options.automaticFollowUp }
      : {}),
    ...(options.outputRepetitionRecovery
      ? { outputRepetitionRecovery: options.outputRepetitionRecovery }
      : {}),
    ...(options.turnGovernorRecovery
      ? { turnGovernorRecovery: options.turnGovernorRecovery }
      : {}),
    ...(options.approvalManager
      ? { approvalManager: options.approvalManager }
      : {}),
  };

  return new CooltoAgent(agentOptions);
}
