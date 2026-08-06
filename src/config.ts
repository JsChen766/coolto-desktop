import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_MODEL_ID } from "./agent/create-agent.js";

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8080";

export type AgentThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface AppConfig {
  apiKey: string;
  modelId: string;
  apiBaseUrl: string;
  thinkingLevel: AgentThinkingLevel;
  /** Maximum lines a resume bullet may occupy (2 or 3). */
  resumeMaxBulletLines: 2 | 3;
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
    thinkingLevel: readThinkingLevel(env),
    resumeMaxBulletLines: readMaxBulletLines(env),
  };
}

function readMaxBulletLines(env: NodeJS.ProcessEnv): 2 | 3 {
  const value = env.COOLTO_RESUME_MAX_BULLET_LINES?.trim();
  if (!value) return 3;
  if (value === "2" || value === "3") return Number(value) as 2 | 3;
  throw new Error(`COOLTO_RESUME_MAX_BULLET_LINES 必须是 2 或 3，当前为 "${value}"`);
}

function readThinkingLevel(env: NodeJS.ProcessEnv): AgentThinkingLevel {
  const value = env.COOLTO_AGENT_THINKING_LEVEL?.trim();
  if (!value) return "off";
  const allowed: AgentThinkingLevel[] = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ];
  if ((allowed as string[]).includes(value)) {
    return value as AgentThinkingLevel;
  }
  throw new Error(
    `COOLTO_AGENT_THINKING_LEVEL 必须是 ${allowed.join(" / ")}，当前为 "${value}"`,
  );
}

export function readApiBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.COOLTO_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
}
