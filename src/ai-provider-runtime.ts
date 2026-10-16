import {
  normalizeAiProviderConfig,
  readAiProviderFromEnv,
  type AiProviderConfig,
} from "./ai-provider-config.js";

let override: Partial<AiProviderConfig> | undefined;

export function setAiProviderOverride(
  config: Partial<AiProviderConfig> | undefined,
): void {
  override = config;
}

export function resolveAiProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): AiProviderConfig {
  return normalizeAiProviderConfig(override ?? {}, readAiProviderFromEnv(env));
}
