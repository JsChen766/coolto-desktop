import type { IpcMain } from "electron";

import type { AgentTaskDelegationInput } from "../../shared/types.js";
import type { UserServices } from "../user-services.js";
import {
  listAgentTaskViews,
  readAgentTaskDetail,
} from "./agent-task-view.js";

export const AGENT_TASK_IPC_CHANNELS = [
  "agent-tasks:list", "agent-tasks:get", "agent-tasks:prepare",
  "agent-tasks:execute-proposal", "agent-tasks:start", "agent-tasks:resume",
  "agent-tasks:pause", "agent-tasks:cancel", "agent-tasks:revoke",
  "agent-tasks:submission-receipt",
] as const;

export function registerAgentTaskIpc(
  ipcMain: IpcMain,
  services: () => Promise<UserServices>,
): void {
  ipcMain.handle("agent-tasks:list", async () =>
    listAgentTaskViews((await services()).agentHarness));
  ipcMain.handle("agent-tasks:get", async (_event, taskId: unknown) => {
    const current = await services();
    return readAgentTaskDetail(current.agentHarness, parseAgentTaskId(taskId, "taskId"));
  });
  ipcMain.handle("agent-tasks:prepare", async (_event, input: unknown) =>
    (await services()).agentTaskProposals.prepare(parseAgentTaskDelegationInput(input)));
  ipcMain.handle("agent-tasks:execute-proposal", async (_event, value: unknown) => {
    const current = await services();
    const taskId = await current.agentTaskProposals.execute(
      parseAgentTaskId(value, "proposalId"),
    );
    return readAgentTaskDetail(current.agentHarness, taskId);
  });
  for (const action of ["start", "resume", "pause", "cancel"] as const) {
    ipcMain.handle(`agent-tasks:${action}`, async (_event, value: unknown) => {
      const current = await services();
      const taskId = parseAgentTaskId(value, "taskId");
      await current.agentTasks[action](taskId);
      return readAgentTaskDetail(current.agentHarness, taskId);
    });
  }
  ipcMain.handle("agent-tasks:revoke", async (_event, value: unknown) => {
    const current = await services();
    const taskId = parseAgentTaskId(value, "taskId");
    await current.agentTasks.revoke(taskId, "user");
    return readAgentTaskDetail(current.agentHarness, taskId);
  });
  ipcMain.handle("agent-tasks:submission-receipt", async (_event, value: unknown) => {
    const receipt = await (await services()).agentHarness.submissions
      .findByApplication(parseAgentTaskId(value, "applicationId"));
    return receipt ? {
      id: receipt.id, jdId: receipt.jdId, resumeId: receipt.resumeId,
      resumeContentHash: receipt.resumeContentHash, company: receipt.company,
      role: receipt.role, targetUrl: receipt.targetUrl,
      siteApplicationId: receipt.siteApplicationId, status: receipt.status,
      createdAt: receipt.createdAt,
    } : undefined;
  });
}

export function parseAgentTaskDelegationInput(
  value: unknown,
): AgentTaskDelegationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AgentTask delegation input 必须是 object");
  }
  assertKeys(value, [
    "conversationId", "goal", "allowedDomains", "blockedDomains",
    "allowedActions", "jobCriteria", "assetPolicy", "answerPolicy",
    "connectorPolicy",
    "unattended", "expiresAt",
  ]);
  const input = value as Partial<AgentTaskDelegationInput>;
  return {
    conversationId: text(input.conversationId, "conversationId", 200),
    goal: text(input.goal, "goal", 4000),
    allowedDomains: strings(input.allowedDomains, "allowedDomains", 100),
    blockedDomains: strings(input.blockedDomains, "blockedDomains", 100),
    allowedActions: strings(input.allowedActions, "allowedActions", 50),
    jobCriteria: jsonRecord(input.jobCriteria, "jobCriteria"),
    assetPolicy: jsonRecord(input.assetPolicy, "assetPolicy"),
    answerPolicy: jsonRecord(input.answerPolicy, "answerPolicy"),
    ...(input.connectorPolicy
      ? { connectorPolicy: jsonRecord(input.connectorPolicy, "connectorPolicy") }
      : {}),
    unattended: boolean(input.unattended, "unattended"),
    expiresAt: text(input.expiresAt, "expiresAt", 100),
  };
}

export function parseAgentTaskId(value: unknown, name = "id"): string {
  return text(value, name, 200);
}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${name} 必须是 1–${max} 字符字符串`);
  }
  return value.trim();
}

function strings(value: unknown, name: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max ||
      value.some((entry) => typeof entry !== "string" || entry.length > 500)) {
    throw new Error(`${name} 必须是最多 ${max} 项的字符串数组`);
  }
  return value.map((entry) => entry.trim()).filter(Boolean);
}

function jsonRecord(value: unknown, name: string): Record<string, never> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} 必须是 JSON object`);
  }
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 50_000) throw new Error(`${name} 过大`);
  return JSON.parse(serialized) as Record<string, never>;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} 必须是 boolean`);
  return value;
}

function assertKeys(value: object, allowed: string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`AgentTask input 不支持字段：${unknown.join(", ")}`);
}
