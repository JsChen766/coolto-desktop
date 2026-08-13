import type { AppConfig } from "../config.js";
import {
  createDeepSeekDependencies,
  type AgentDependencies,
} from "./create-agent.js";

type ModelAccessConfig = Pick<
  AppConfig,
  "apiKey" | "modelId" | "llmGatewayBaseUrl" | "llmOperationType"
>;

/**
 * Local dev builds use a direct DeepSeek connection when DEEPSEEK_API_KEY is
 * configured; production (desktop app / credited accounts) routes through the
 * authenticated Coolto LLM gateway with credit metadata.
 */
export function createConfiguredModelDependencies(
  config: ModelAccessConfig,
  getSessionToken: () => string,
): AgentDependencies {
  if (config.apiKey) {
    return createDeepSeekDependencies(config.modelId);
  }
  return createDeepSeekDependencies(
    config.modelId,
    config.llmGatewayBaseUrl
      ? {
          baseUrl: config.llmGatewayBaseUrl,
          operationType: config.llmOperationType,
          getSessionToken,
        }
      : undefined,
  );
}
