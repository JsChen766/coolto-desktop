import {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL_ID,
} from "./local-desktop.js";

export { DEFAULT_LLM_BASE_URL } from "./local-desktop.js";

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export interface AiProviderPublicView {
  baseUrl: string;
  modelId: string;
  hasApiKey: boolean;
}

export function normalizeAiProviderConfig(
  input: Partial<AiProviderConfig>,
  fallback: Partial<AiProviderConfig> = {},
): AiProviderConfig {
  return {
    baseUrl: trimOrDefault(input.baseUrl, fallback.baseUrl, DEFAULT_LLM_BASE_URL),
    apiKey: trimOrDefault(input.apiKey, fallback.apiKey, ""),
    modelId: trimOrDefault(input.modelId, fallback.modelId, DEFAULT_LLM_MODEL_ID),
  };
}

export function readAiProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Partial<AiProviderConfig> {
  return {
    baseUrl: env.LLM_BASE_URL?.trim() || env.OPENAI_BASE_URL?.trim() || "",
    apiKey: env.LLM_API_KEY?.trim()
      || env.OPENAI_API_KEY?.trim()
      || env.DEEPSEEK_API_KEY?.trim()
      || "",
    modelId: env.LLM_MODEL?.trim() || env.COOLTO_MODEL?.trim() || "",
  };
}

export function toAiProviderPublicView(
  config: AiProviderConfig,
): AiProviderPublicView {
  return {
    baseUrl: config.baseUrl,
    modelId: config.modelId,
    hasApiKey: config.apiKey.length > 0,
  };
}

function trimOrDefault(
  value: string | undefined,
  fallback: string | undefined,
  defaultValue: string,
): string {
  const next = value?.trim() || fallback?.trim() || "";
  return next || defaultValue;
}
