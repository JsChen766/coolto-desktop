import type {
  AgentMessage,
  AgentTool,
  BeforeToolCallContext,
  BeforeToolCallResult,
  StreamFn,
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
import { compactResumeGenerationContext } from "./context-policy.js";
import { COOLTO_SYSTEM_PROMPT } from "./system-prompt.js";

export const DEFAULT_MODEL_ID = "deepseek-v4-flash";
export const DEFAULT_PROVIDER_ID = "deepseek";

export interface CreateAgentOptions {
  apiKey?: string;
  modelId?: string;
  systemPrompt?: string;
  tools?: AgentTool[];
  thinkingLevel?: import("@earendil-works/pi-ai").ThinkingLevel;
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>;
  transformContext?: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>;
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
      // 输出上限与服务端 pricing.json 的 max_completion_tokens 一致（16384）。
      // 不设置时服务端按 8192 兜底，推理模型的 thinking 会吃光预算导致
      // 工具调用参数被截断 → 客户端判失败 → 模型重试 → 重复死循环。
      const streamOptions = { ...options, temperature: 0, maxTokens: 16384 };
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
    transformContext:
      options.transformContext ?? compactResumeGenerationContext,
    ...(options.approvalManager
      ? { approvalManager: options.approvalManager }
      : {}),
  };

  return new CooltoAgent(agentOptions);
}

const REPETITION_LIMIT = 3;

/**
 * 连续 N 次相同工具调用（同工具名 + 同参数）即判定为重复死循环并 block。
 * 温度 0 下失败重试会产生逐 token 相同的输出（输出截断 → 工具判失败 →
 * 模型重试 → 再截断），此守卫是这类确定性循环的兜底：block 后错误信息
 * 进入上下文，输入变化足以让模型停止。
 */
function createRepetitionGuard(limit: number) {
  let lastKey: string | undefined;
  let consecutive = 0;
  return async (
    context: BeforeToolCallContext,
  ): Promise<BeforeToolCallResult | undefined> => {
    const key = `${context.toolCall.name}\u0000${stableStringify(context.args)}`;
    if (key === lastKey) {
      consecutive += 1;
    } else {
      lastKey = key;
      consecutive = 1;
    }
    if (consecutive >= limit) {
      return {
        block: true,
        reason:
          "detected_repetition：检测到连续重复的工具调用（参数完全相同），" +
          "请停止重试同一操作，基于当前结果继续或结束任务。",
      };
    }
    return undefined;
  };
}

/** 键序无关的 JSON 序列化（重试产生的参数键顺序可能不同）。 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

const repetitionGuard = createRepetitionGuard(REPETITION_LIMIT);
