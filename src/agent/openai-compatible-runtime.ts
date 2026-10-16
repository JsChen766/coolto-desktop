import { createModels, type MutableModels } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";

import { DEFAULT_LLM_BASE_URL } from "../local-desktop.js";
import {
  AGENT_TEMPERATURE,
  DEFAULT_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  type AgentDependencies,
} from "./create-agent.js";

export function createOpenAiCompatibleDependencies(
  modelId = DEFAULT_MODEL_ID,
  baseUrl = DEFAULT_LLM_BASE_URL,
  getApiKey?: () => string,
): AgentDependencies {
  const models: MutableModels = createModels();
  models.setProvider(deepseekProvider());
  const registered = models.getModel(DEFAULT_PROVIDER_ID, DEFAULT_MODEL_ID);
  if (!registered) {
    throw new Error("OpenAI 兼容运行时缺少默认模型模板");
  }
  const model = {
    ...registered,
    id: modelId.trim() || DEFAULT_MODEL_ID,
    baseUrl: baseUrl.replace(/\/+$/u, "") || DEFAULT_LLM_BASE_URL,
  };
  const baseStream = models.streamSimple.bind(models);
  return {
    model,
    models,
    streamFn: (modelInput, context, options) => {
      const apiKey = getApiKey?.().trim();
      return baseStream(modelInput, context, {
        ...options,
        temperature: AGENT_TEMPERATURE,
        ...(apiKey ? { apiKey } : {}),
      });
    },
  };
}
