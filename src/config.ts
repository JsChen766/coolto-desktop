import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_MODEL_ID } from "./agent/create-agent.js";

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8080";

export interface AppConfig {
  apiKey: string;
  modelId: string;
  apiBaseUrl: string;
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
    apiBaseUrl: readApiBaseUrl(env),
  };
}

export function readApiBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.COOLTO_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
}
