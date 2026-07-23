import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_MODEL_ID } from "./agent/create-agent.js";

export interface AppConfig {
  apiKey: string;
  modelId: string;
}

export function loadLocalEnv(cwd = process.cwd()): void {
  const envFile = resolve(cwd, ".env");
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

export function readConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "缺少 DEEPSEEK_API_KEY。请复制 .env.example 为 .env 并填写本地开发密钥。",
    );
  }

  return {
    apiKey,
    modelId: env.COOLTO_MODEL?.trim() || DEFAULT_MODEL_ID,
  };
}
