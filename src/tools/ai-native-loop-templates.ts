import type { AgentTaskDelegationInput } from "../desktop/shared/types.js";

export interface ResumeJobLoopInput {
  conversationId: string;
  goal: string;
  resumeId: string;
  resumeTitle: string;
  resumeContentHash: string;
  sources: Array<{
    provider: "greenhouse" | "lever";
    sourceKey: string;
    company: string;
  }>;
  applicationDomains: string[];
  expiresAt: string;
}

export interface MailScheduleLoopInput {
  conversationId: string;
  goal: string;
  directions: Array<"received" | "sent">;
  browserWebmail: boolean;
  mailConnectionIds: string[];
  allowedDomains: string[];
  pollIntervalMinutes: number;
  expiresAt: string;
}

export function resumeJobLoopTemplate(
  input: ResumeJobLoopInput,
): AgentTaskDelegationInput {
  const resumeId = input.resumeId.trim();
  const resumeTitle = input.resumeTitle.trim();
  if (!resumeId || !resumeTitle) throw new Error("所选 Resume ID 和标题不能为空");
  if (!/^[0-9a-f]{64}$/u.test(input.resumeContentHash)) {
    throw new Error("所选 Resume 缺少有效 contentHash");
  }
  if (!input.sources.length) throw new Error("岗位 Loop 至少需要一个公开岗位源");
  const sources = input.sources.map((source) => ({
    ...source,
    sourceKey: source.sourceKey.trim(),
    company: source.company.trim(),
  }));
  if (sources.some((source) => !source.sourceKey || !source.company)) {
    throw new Error("岗位源 sourceKey/company 不能为空");
  }
  const sourceDomains = sources.flatMap((source) => source.provider === "greenhouse"
    ? ["boards-api.greenhouse.io", "boards.greenhouse.io"]
    : ["api.lever.co", "jobs.lever.co"]);
  return {
    conversationId: input.conversationId,
    goal: input.goal,
    allowedDomains: [...new Set([...sourceDomains, ...input.applicationDomains])],
    blockedDomains: [],
    allowedActions: [
      "resume.read", "jd.read", "jd.write", "jobs.search", "jobs.evaluate",
      "browser.read", "browser.control", "browser.write", "browser.review",
      "browser.submit", "tracker.application.create",
      "answers.read", "answers.prepare",
    ],
    jobCriteria: {
      loopKind: "resume_job_apply",
      minimumMatch: 80,
      sources,
    },
    assetPolicy: {
      resumeId,
      resumeTitle,
      resumeContentHash: input.resumeContentHash,
      submissionMode: "confirm_each",
    },
    answerPolicy: {
      savedAnswers: "scoped_only",
      subjectiveQuestions: "ask",
      legalDeclarations: "ask",
    },
    connectorPolicy: { loopKind: "resume_job_apply" },
    unattended: true,
    expiresAt: input.expiresAt,
  };
}

export function mailScheduleLoopTemplate(
  input: MailScheduleLoopInput,
): AgentTaskDelegationInput {
  if (!input.directions.length) throw new Error("App 日程 Loop 至少需要一个邮件方向");
  if (!Number.isInteger(input.pollIntervalMinutes) ||
      input.pollIntervalMinutes < 5 || input.pollIntervalMinutes > 1440) {
    throw new Error("App 日程 Loop 轮询间隔必须是 5–1440 分钟整数");
  }
  const mailConnectionIds = [...new Set(input.mailConnectionIds
    .map((value) => value.trim()).filter(Boolean))];
  if (!input.browserWebmail && !mailConnectionIds.length) {
    throw new Error("App 日程 Loop 必须选择 Browser Webmail 或已连接邮箱");
  }
  if (!input.browserWebmail && input.directions.includes("sent")) {
    throw new Error("发件识别需要 Browser Webmail；邮箱 API 直连仅支持收件");
  }
  if (input.browserWebmail && !input.allowedDomains.length) {
    throw new Error("Browser Webmail Loop 必须冻结邮箱 domain");
  }
  return {
    conversationId: input.conversationId,
    goal: input.goal,
    allowedDomains: input.allowedDomains,
    blockedDomains: [],
    allowedActions: [
      ...(input.browserWebmail
        ? ["browser.read", "browser.control", "browser.write"] : []),
      "mail.read", "mail.classify", "tracker.application.read",
      "tracker.application.update", "tracker.interview.update",
    ],
    jobCriteria: { loopKind: "mail_app_schedule" },
    assetPolicy: {},
    answerPolicy: { ambiguousApplication: "ask", incompleteTime: "ask" },
    connectorPolicy: {
      loopKind: "mail_app_schedule",
      appSchedule: true,
      scheduleMailDirections: [...new Set(input.directions)],
      browserWebmail: input.browserWebmail,
      mailConnectionIds,
      pollIntervalMinutes: input.pollIntervalMinutes,
    },
    unattended: true,
    expiresAt: input.expiresAt,
  };
}
