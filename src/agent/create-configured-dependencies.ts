import { resolveAiProviderConfig } from "../ai-provider-runtime.js";
import type { AppConfig } from "../config.js";
import { createOpenAiCompatibleDependencies } from "./openai-compatible-runtime.js";
import type { AgentDependencies } from "./create-agent.js";

type ModelAccessConfig = Pick<AppConfig, "apiKey" | "modelId">;

/** Open-source Desktop talks to the user-supplied OpenAI-compatible endpoint. */
export function createConfiguredModelDependencies(
  config: ModelAccessConfig,
  _getSessionToken: () => string,
): AgentDependencies {
  const provider = resolveAiProviderConfig();
  return createOpenAiCompatibleDependencies(
    config.modelId || provider.modelId,
    provider.baseUrl,
    () => provider.apiKey || config.apiKey || "",
  );
}
