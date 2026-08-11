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
    streamFn: (modelInput, context, options) => {
      if (!gateway) {
        return baseStream(modelInput, context, {
          ...options,
          temperature: 0,
        });
      }
      const originalPayloadTransform = options?.onPayload;
      return baseStream(modelInput, context, {
        ...options,
        apiKey: "coolto-session-auth",
        headers: {
          ...options?.headers,
          Cookie: `access_token=${gateway.getSessionToken()}`,
        },
        temperature: 0,
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
      ? { beforeToolCall: options.beforeToolCall }
      : {}),
    transformContext:
      options.transformContext ?? compactResumeGenerationContext,
    ...(options.approvalManager
      ? { approvalManager: options.approvalManager }
      : {}),
  };

  return new CooltoAgent(agentOptions);
}
