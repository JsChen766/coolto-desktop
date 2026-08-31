import type { AgentTaskDelegationInput } from "../desktop/shared/types.js";
import { normalizedAutoStartAfter } from "./ai-native-loop-schedule.js";

interface BaseLoopInput {
  conversationId: string;
  goal: string;
  expiresAt: string;
}

export interface FollowUpLoopInput extends BaseLoopInput {
  applicationId: string;
  allowedDomains: string[];
  checkIntervalHours: number;
  autoStartAfter: string;
}

export interface InterviewBriefingLoopInput extends BaseLoopInput {
  applicationId: string;
  interviewId: string;
  researchDomains: string[];
  wakeBeforeMinutes: number;
  autoStartAfter: string;
}

export interface StrategyLoopInput extends BaseLoopInput {
  reviewIntervalDays: number;
}

export interface RiskDeadlineLoopInput extends BaseLoopInput {
  directions: Array<"received" | "sent">;
  browserWebmail: boolean;
  mailConnectionIds: string[];
  allowedDomains: string[];
  pollIntervalMinutes: number;
}

export function followUpLoopTemplate(input: FollowUpLoopInput): AgentTaskDelegationInput {
  return applicationTemplate(input, "application_follow_up", [
    "application.loop.read", "follow_up.write", "jd.read", "resume.read",
    "browser.read", "browser.control", "browser.write",
  ], {
    checkIntervalHours: boundedInteger(input.checkIntervalHours, 1, 720, "跟进检查间隔"),
    autoStartAfter: normalizedAutoStartAfter(input.autoStartAfter),
  }, input.allowedDomains);
}

export function interviewBriefingLoopTemplate(
  input: InterviewBriefingLoopInput,
): AgentTaskDelegationInput {
  return applicationTemplate(input, "interview_briefing", [
    "application.loop.read", "briefing.write", "jd.read", "resume.read",
    "experience.read", ...(input.researchDomains.length ? ["browser.read", "browser.control"] : []),
  ], {
    interviewId: input.interviewId,
    wakeBeforeMinutes: boundedInteger(input.wakeBeforeMinutes, 15, 10_080, "简报提前时间"),
    autoStartAfter: normalizedAutoStartAfter(input.autoStartAfter),
  }, input.researchDomains);
}

export function strategyLoopTemplate(input: StrategyLoopInput): AgentTaskDelegationInput {
  return {
    conversationId: input.conversationId, goal: input.goal,
    allowedDomains: [], blockedDomains: [],
    allowedActions: ["strategy.read", "strategy.write"],
    jobCriteria: { loopKind: "application_strategy" },
    assetPolicy: {}, answerPolicy: { changes: "proposal_only" },
    connectorPolicy: {
      loopKind: "application_strategy",
      reviewIntervalDays: boundedInteger(input.reviewIntervalDays, 1, 90, "策略复盘间隔"),
    },
    unattended: true, expiresAt: input.expiresAt,
  };
}

export function riskDeadlineLoopTemplate(
  input: RiskDeadlineLoopInput,
): AgentTaskDelegationInput {
  if (!input.browserWebmail && !input.mailConnectionIds.length) {
    throw new Error("风险 Loop 必须选择 Browser Webmail 或已连接邮箱");
  }
  if (!input.browserWebmail && input.directions.includes("sent")) {
    throw new Error("发件风险监控需要 Browser Webmail；邮箱 API 直连仅支持收件");
  }
  if (input.browserWebmail && !input.allowedDomains.length) {
    throw new Error("Browser Webmail 风险 Loop 必须冻结 domain");
  }
  return {
    conversationId: input.conversationId, goal: input.goal,
    allowedDomains: input.allowedDomains, blockedDomains: [],
    allowedActions: [
      ...(input.browserWebmail ? ["browser.read", "browser.control", "browser.write"] : []),
      "mail.read", "mail.classify", "tracker.application.read",
      "risk.write", "reminder.prepare",
    ],
    jobCriteria: { loopKind: "risk_deadline_watch" },
    assetPolicy: { applicationScope: "mail_linked" },
    answerPolicy: { ambiguousRisk: "show_review", destructiveAction: "block" },
    connectorPolicy: {
      loopKind: "risk_deadline_watch",
      browserWebmail: input.browserWebmail,
      mailConnectionIds: [...new Set(input.mailConnectionIds)],
      riskMailDirections: [...new Set(input.directions)],
      pollIntervalMinutes: boundedInteger(input.pollIntervalMinutes, 5, 1440, "风险检查间隔"),
    },
    unattended: true, expiresAt: input.expiresAt,
  };
}

function applicationTemplate(
  input: BaseLoopInput & { applicationId: string },
  loopKind: "application_follow_up" | "interview_briefing",
  allowedActions: string[],
  connector: Record<string, string | number>,
  allowedDomains: string[],
): AgentTaskDelegationInput {
  if (!input.applicationId.trim()) throw new Error("Loop 必须冻结 Application");
  return {
    conversationId: input.conversationId, goal: input.goal,
    allowedDomains, blockedDomains: [], allowedActions,
    jobCriteria: { loopKind },
    assetPolicy: { applicationId: input.applicationId },
    answerPolicy: { externalCommitment: "user_only" },
    connectorPolicy: { loopKind, ...connector },
    unattended: true, expiresAt: input.expiresAt,
  };
}

function boundedInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min}–${max} 整数`);
  }
  return value;
}
