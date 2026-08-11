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

const CREDIT_OPERATION_TYPES = [
  "jd_parse",
  "match_analyze",
  "match_score",
  "resume_generate",
  "cover_letter",
  "self_intro",
  "experience_extract",
  "jd_suggest",
] as const;

export type CreditOperationType = (typeof CREDIT_OPERATION_TYPES)[number];

export interface AppConfig {
  apiKey?: string;
  modelId: string;
  apiBaseUrl: string;
  llmGatewayBaseUrl?: string;
  llmOperationType: CreditOperationType;
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
  const llmGatewayBaseUrl = env.COOLTO_LLM_GATEWAY_BASE_URL?.trim();
  if (!apiKey && !llmGatewayBaseUrl) {
    throw new Error(
      "缺少模型访问配置。生产 APP 请设置 COOLTO_LLM_GATEWAY_BASE_URL；本地直连开发请设置 DEEPSEEK_API_KEY。",
    );
  }

  return {
    ...(apiKey ? { apiKey } : {}),
    modelId: env.COOLTO_MODEL?.trim() || DEFAULT_MODEL_ID,
    apiBaseUrl: readApiBaseUrl(env),
    ...(llmGatewayBaseUrl ? { llmGatewayBaseUrl } : {}),
    llmOperationType: readOperationType(env),
    thinkingLevel: readThinkingLevel(env),
    resumeMaxBulletLines: readMaxBulletLines(env),
  };
}

function readOperationType(env: NodeJS.ProcessEnv): CreditOperationType {
  const value = env.COOLTO_LLM_OPERATION_TYPE?.trim() || "match_analyze";
  if ((CREDIT_OPERATION_TYPES as readonly string[]).includes(value)) {
    return value as CreditOperationType;
  }
  throw new Error(
    `COOLTO_LLM_OPERATION_TYPE 必须是 ${CREDIT_OPERATION_TYPES.join(" / ")}，当前为 "${value}"`,
  );
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
