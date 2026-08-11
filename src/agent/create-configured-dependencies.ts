import type { AppConfig } from "../config.js";
import {
  createDeepSeekDependencies,
  type AgentDependencies,
} from "./create-agent.js";

type ModelAccessConfig = Pick<
  AppConfig,
  "modelId" | "llmGatewayBaseUrl" | "llmOperationType"
>;

export function createConfiguredModelDependencies(
  config: ModelAccessConfig,
  getSessionToken: () => string,
): AgentDependencies {
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
