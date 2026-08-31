import type { IpcMain } from "electron";
import type {
  FollowUpLoopPrepareInput,
  InterviewBriefingLoopPrepareInput,
  RiskDeadlineLoopPrepareInput,
  StrategyLoopPrepareInput,
} from "../../shared/types.js";
import {
  followUpLoopTemplate, interviewBriefingLoopTemplate,
  riskDeadlineLoopTemplate, strategyLoopTemplate,
} from "../../../tools/ai-native-extended-loop-templates.js";
import type { UserServices } from "../user-services.js";
import {
  briefingAutoStartAfter, followUpAutoStartAfter,
} from "../../../tools/ai-native-loop-schedule.js";

export const EXTENDED_LOOP_IPC_CHANNELS = [
  "agent-tasks:prepare-follow-up-loop",
  "agent-tasks:prepare-interview-briefing-loop",
  "agent-tasks:prepare-strategy-loop",
  "agent-tasks:prepare-risk-deadline-loop",
] as const;

export function registerExtendedLoopIpc(
  ipcMain: IpcMain,
  services: () => Promise<UserServices>,
): void {
  ipcMain.handle(EXTENDED_LOOP_IPC_CHANNELS[0], async (_event, value) => {
    const current = await services();
    const input = parseFollowUpLoopInput(value);
    const application = await current.applications.getApplication(input.applicationId);
    if (["offer", "rejected"].includes(application.status)) {
      throw new Error("终态投递不创建跟进 Loop");
    }
    return current.agentTaskProposals.prepare(followUpLoopTemplate({
      ...input,
      autoStartAfter: followUpAutoStartAfter(input.checkIntervalHours),
    }));
  });
  ipcMain.handle(EXTENDED_LOOP_IPC_CHANNELS[1], async (_event, value) => {
    const current = await services();
    const input = parseBriefingLoopInput(value);
    await current.applications.getApplication(input.applicationId);
    const interview = await current.interviews.get(input.interviewId);
    if (interview.applicationId !== input.applicationId || interview.status !== "scheduled") {
      throw new Error("必须选择当前投递的 scheduled Interview");
    }
    return current.agentTaskProposals.prepare(interviewBriefingLoopTemplate({
      ...input,
      autoStartAfter: briefingAutoStartAfter(
        interview.scheduledAt, input.wakeBeforeMinutes,
      ),
    }));
  });
  ipcMain.handle(EXTENDED_LOOP_IPC_CHANNELS[2], async (_event, value) => {
    const current = await services();
    return current.agentTaskProposals.prepare(
      strategyLoopTemplate(parseStrategyLoopInput(value)),
    );
  });
  ipcMain.handle(EXTENDED_LOOP_IPC_CHANNELS[3], async (_event, value) => {
    const current = await services();
    const input = parseRiskLoopInput(value);
    const available = new Set((await current.mailConnections.list()).map((item) => item.id));
    if (input.mailConnectionIds.some((id) => !available.has(id))) {
      throw new Error("风险 Loop 包含不可用邮箱连接");
    }
    return current.agentTaskProposals.prepare(riskDeadlineLoopTemplate(input));
  });
}

export function parseFollowUpLoopInput(value: unknown): FollowUpLoopPrepareInput {
  const input = record(value);
  return {
    ...base(input), applicationId: text(input.applicationId, "applicationId"),
    allowedDomains: strings(input.allowedDomains),
    checkIntervalHours: integer(input.checkIntervalHours, 1, 720, "checkIntervalHours"),
  };
}

export function parseBriefingLoopInput(value: unknown): InterviewBriefingLoopPrepareInput {
  const input = record(value);
  return {
    ...base(input), applicationId: text(input.applicationId, "applicationId"),
    interviewId: text(input.interviewId, "interviewId"),
    researchDomains: strings(input.researchDomains),
    wakeBeforeMinutes: integer(input.wakeBeforeMinutes, 15, 10_080, "wakeBeforeMinutes"),
  };
}

export function parseStrategyLoopInput(value: unknown): StrategyLoopPrepareInput {
  const input = record(value);
  return { ...base(input),
    reviewIntervalDays: integer(input.reviewIntervalDays, 1, 90, "reviewIntervalDays") };
}

export function parseRiskLoopInput(value: unknown): RiskDeadlineLoopPrepareInput {
  const input = record(value);
  const directions = strings(input.directions);
  if (!directions.length || directions.some((item) => !["received", "sent"].includes(item))) {
    throw new Error("directions 必须是 received/sent");
  }
  return {
    ...base(input), directions: directions as Array<"received" | "sent">,
    browserWebmail: bool(input.browserWebmail, "browserWebmail"),
    mailConnectionIds: strings(input.mailConnectionIds),
    allowedDomains: strings(input.allowedDomains),
    pollIntervalMinutes: integer(input.pollIntervalMinutes, 5, 1440, "pollIntervalMinutes"),
  };
}

function base(input: Record<string, unknown>) {
  return {
    conversationId: text(input.conversationId, "conversationId"),
    goal: text(input.goal, "goal", 4000),
    expiresAt: text(input.expiresAt, "expiresAt"),
  };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Loop input 必须是 object");
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${name} 无效`);
  }
  return value.trim();
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50 ||
      value.some((item) => typeof item !== "string" || item.length > 500)) {
    throw new Error("Loop 字符串数组无效");
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}
function integer(value: unknown, min: number, max: number, name: string): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${name} 必须是 ${min}–${max} 整数`);
  }
  return Number(value);
}
function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} 必须是 boolean`);
  return value;
}
