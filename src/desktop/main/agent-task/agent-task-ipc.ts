import type { IpcMain } from "electron";
import type {
  AgentTaskDelegationInput,
  AgentTaskDetailView,
  BrowserState,
  MailScheduleLoopPrepareInput,
  ResumeJobLoopPrepareInput,
} from "../../shared/types.js";
import type { UserServices } from "../user-services.js";
import {
  listAgentTaskViews,
  readAgentTaskDetail,
} from "./agent-task-view.js";
import {
  mailScheduleLoopTemplate,
  resumeJobLoopTemplate,
} from "../../../tools/ai-native-loop-templates.js";
import { EXTENDED_LOOP_IPC_CHANNELS, registerExtendedLoopIpc } from
  "./extended-loop-ipc.js";
import { assertMailConnectionsBelongToAccount } from "./validate-mail-schedule-connections.js";
export const AGENT_TASK_IPC_CHANNELS = [
  "agent-tasks:list", "agent-tasks:get", "agent-tasks:prepare",
  "agent-tasks:execute-proposal", "agent-tasks:start", "agent-tasks:resume",
  "agent-tasks:pause", "agent-tasks:cancel", "agent-tasks:revoke",
  "agent-tasks:submission-receipt",
  "agent-tasks:prepare-resume-job-loop", "agent-tasks:prepare-mail-schedule-loop",
  ...EXTENDED_LOOP_IPC_CHANNELS,
] as const;
export function registerAgentTaskIpc(
  ipcMain: IpcMain,
  services: () => Promise<UserServices>,
  openVisibleBrowser: OpenVisibleBrowser,
): void {
  ipcMain.handle("agent-tasks:list", async () =>
    listAgentTaskViews((await services()).agentHarness));
  ipcMain.handle("agent-tasks:get", async (_event, taskId: unknown) => {
    const current = await services();
    return readAgentTaskDetail(current.agentHarness, parseAgentTaskId(taskId, "taskId"));
  });
  ipcMain.handle("agent-tasks:prepare", async (_event, input: unknown) =>
    (await services()).agentTaskProposals.prepare(parseAgentTaskDelegationInput(input)));
  registerExtendedLoopIpc(ipcMain, services);
  ipcMain.handle("agent-tasks:prepare-resume-job-loop", async (_event, value: unknown) => {
    const current = await services();
    const input = parseResumeJobLoopInput(value);
    const resume = await current.resumes.getResume(input.resumeId);
    if (resume.status !== "active" || resume.qualityStatus !== "passed") {
      throw new Error("只有 active 且质量通过的云端简历可以启动自动找岗");
    }
    return current.agentTaskProposals.prepare(resumeJobLoopTemplate({
      ...input, resumeTitle: resume.title, resumeContentHash: resume.contentHash,
    }));
  });
  ipcMain.handle("agent-tasks:prepare-mail-schedule-loop", async (_event, value: unknown) => {
    const current = await services();
    const input = parseMailScheduleLoopInput(value);
    const available = new Set((await current.mailConnections.list()).map((item) => item.id));
    assertMailConnectionsBelongToAccount(input.mailConnectionIds, available);
    return current.agentTaskProposals.prepare(mailScheduleLoopTemplate(input));
  });
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
      const detail = action === "start" || action === "resume"
        ? await readAgentTaskDetail(current.agentHarness, taskId)
        : { grant: null };
      await runAgentTaskAction(
        action,
        detail,
        openVisibleBrowser,
        () => current.agentTasks[action](taskId).then(() => undefined),
      );
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

export type OpenVisibleBrowser = () => BrowserState | Promise<BrowserState>;

export async function runAgentTaskAction(
  action: "start" | "resume" | "pause" | "cancel",
  detail: Pick<AgentTaskDetailView, "grant">,
  openVisibleBrowser: OpenVisibleBrowser,
  execute: () => Promise<void>,
): Promise<void> {
  const needsBrowser = (action === "start" || action === "resume") &&
    detail.grant?.revokedAt === null &&
    detail.grant.allowedActions.some((value) => value.startsWith("browser."));
  if (needsBrowser) {
    const state = await openVisibleBrowser();
    if (!state.isOpen) {
      throw new Error("可见浏览器未能打开，Agent 任务尚未启动");
    }
  }
  await execute();
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

export function parseResumeJobLoopInput(value: unknown): ResumeJobLoopPrepareInput {
  const input = object(value, [
    "conversationId", "goal", "resumeId", "sources", "applicationDomains", "expiresAt",
  ]);
  if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 20) {
    throw new Error("sources 必须包含 1–20 个岗位源");
  }
  return {
    conversationId: text(input.conversationId, "conversationId", 200),
    goal: text(input.goal, "goal", 4000),
    resumeId: text(input.resumeId, "resumeId", 200),
    sources: input.sources.map((source, index) => {
      const item = object(source, ["provider", "sourceKey", "company"]);
      if (item.provider !== "greenhouse" && item.provider !== "lever") {
        throw new Error(`sources[${index}].provider 无效`);
      }
      return {
        provider: item.provider,
        sourceKey: text(item.sourceKey, `sources[${index}].sourceKey`, 100),
        company: text(item.company, `sources[${index}].company`, 300),
      };
    }),
    applicationDomains: strings(input.applicationDomains, "applicationDomains", 50),
    expiresAt: text(input.expiresAt, "expiresAt", 100),
  };
}

export function parseMailScheduleLoopInput(value: unknown): MailScheduleLoopPrepareInput {
  const input = object(value, [
    "conversationId", "goal", "directions", "browserWebmail", "mailConnectionIds",
    "allowedDomains", "pollIntervalMinutes", "expiresAt",
  ]);
  const directions = strings(input.directions, "directions", 2);
  if (!directions.length || directions.some((item) => !["received", "sent"].includes(item))) {
    throw new Error("directions 必须是 received/sent");
  }
  const poll = input.pollIntervalMinutes;
  if (!Number.isInteger(poll) || Number(poll) < 5 || Number(poll) > 1440) {
    throw new Error("pollIntervalMinutes 必须是 5–1440 整数");
  }
  return {
    conversationId: text(input.conversationId, "conversationId", 200),
    goal: text(input.goal, "goal", 4000),
    directions: [...new Set(directions)] as Array<"received" | "sent">,
    browserWebmail: boolean(input.browserWebmail, "browserWebmail"),
    mailConnectionIds: strings(input.mailConnectionIds, "mailConnectionIds", 20),
    allowedDomains: strings(input.allowedDomains, "allowedDomains", 50),
    pollIntervalMinutes: Number(poll),
    expiresAt: text(input.expiresAt, "expiresAt", 100),
  };
}

function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Loop input 必须是 object");
  }
  assertKeys(value, allowed);
  return value as Record<string, unknown>;
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
