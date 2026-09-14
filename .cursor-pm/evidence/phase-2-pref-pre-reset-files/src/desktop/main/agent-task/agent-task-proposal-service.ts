import { canonicalHash } from "../../../agent-task/canonical-hash.js";
import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import type { JsonValue } from "../../../agent-task/json-types.js";
import { createDefaultStagePolicy } from "../../../agent-task/stage-policy.js";
import { uuidV7 } from "../../../agent-task/uuid-v7.js";
import type {
  AgentTaskDelegationInput,
  AgentTaskProposalView,
} from "../../shared/types.js";

const ALLOWED_ACTIONS = new Set([
  "browser.read", "browser.control", "browser.write", "browser.download",
  "browser.request_access", "browser.review", "task.lifecycle",
  "jobs.search", "jobs.evaluate",
  "resume.read",
  "jd.read", "jd.write",
  "application.loop.read", "follow_up.write", "briefing.write",
  "strategy.read", "strategy.write", "risk.write", "reminder.prepare",
  "experience.read",
  "browser.submit", "tracker.application.create",
  "answers.read", "answers.prepare",
  "mail.read", "mail.classify",
  "tracker.application.read",
  "tracker.application.update",
  "tracker.interview.update",
]);

interface StoredProposal {
  view: AgentTaskProposalView;
  executedTaskId: string | null;
}

export class AgentTaskProposalService {
  readonly #proposals = new Map<string, StoredProposal>();

  public constructor(private readonly services: AgentHarnessServices) {}

  public prepare(input: AgentTaskDelegationInput): AgentTaskProposalView {
    const normalized = normalizeInput(input);
    const createdAt = new Date().toISOString();
    const view: AgentTaskProposalView = {
      id: uuidV7(),
      contentHash: canonicalHash(normalized as unknown as JsonValue),
      input: normalized,
      minimumMatch: 80,
      dailyApplicationLimit: null,
      mailSendAlwaysManual: true,
      appOpenOnly: true,
      rawObservationRetentionDays: 7,
      actionReceiptRetentionDays: 90,
      createdAt,
    };
    this.#proposals.set(view.id, { view: structuredClone(view), executedTaskId: null });
    return structuredClone(view);
  }

  public async execute(proposalId: string): Promise<string> {
    const stored = this.#proposals.get(proposalId);
    if (!stored) throw new Error("AgentTask Proposal 不存在或已失效");
    if (stored.executedTaskId) return stored.executedTaskId;
    const view = stored.view;
    if (canonicalHash(view.input as unknown as JsonValue) !== view.contentHash) {
      throw new Error("AgentTask Proposal contentHash 校验失败");
    }
    const now = new Date().toISOString();
    const created = await this.services.tasks.provision({
      conversationId: view.input.conversationId,
      goal: view.input.goal,
      grant: {
        allowedDomains: view.input.allowedDomains,
        blockedDomains: view.input.blockedDomains,
        allowedActions: view.input.allowedActions,
        stagePolicy: createDefaultStagePolicy(view.input.allowedActions),
        jobCriteria: view.input.jobCriteria,
        assetPolicy: view.input.assetPolicy,
        answerPolicy: view.input.answerPolicy,
        connectorPolicy: view.input.connectorPolicy ?? {},
        submissionBudget: { minimumMatch: 80, dailyLimit: null },
        unattended: view.input.unattended,
        validFrom: now,
        expiresAt: view.input.expiresAt,
        policyVersion: "browser-enhance-be2-v1",
      },
      confirmedByUserAt: now,
    });
    stored.executedTaskId = created.task.id;
    return created.task.id;
  }
}

function normalizeInput(input: AgentTaskDelegationInput): AgentTaskDelegationInput {
  const conversationId = input.conversationId.trim();
  const goal = input.goal.trim();
  if (!conversationId || !goal) throw new Error("Conversation 和任务目标不能为空");
  const expiresAt = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("DelegationGrant 有效期无效或已过期");
  }
  const connectorPolicy = input.connectorPolicy
    ? structuredClone(input.connectorPolicy) : undefined;
  const autoStartAfter = connectorPolicy?.autoStartAfter;
  if (autoStartAfter !== undefined) {
    const timestamp = typeof autoStartAfter === "string"
      ? Date.parse(autoStartAfter) : Number.NaN;
    if (!Number.isFinite(timestamp) || timestamp > expiresAt) {
      throw new Error("Loop autoStartAfter 无效或晚于授权有效期");
    }
    connectorPolicy!.autoStartAfter = new Date(timestamp).toISOString();
  }
  const allowedActions = [...new Set([
    ...input.allowedActions.map((value) => value.trim()),
    "task.lifecycle",
  ])]
    .filter(Boolean).sort();
  if (allowedActions.includes("mail.send")) throw new Error("mail.send 永远不能托管授权");
  const invalid = allowedActions.filter((value) => !ALLOWED_ACTIONS.has(value));
  if (invalid.length) throw new Error(`BE2 不支持授权动作：${invalid.join(", ")}`);
  const allowedDomains = expandKnownProviderDomains(
    normalizeDomains(input.allowedDomains),
  );
  const blockedDomains = normalizeDomains(input.blockedDomains);
  if (allowedActions.some((value) => value.startsWith("browser.")) &&
      allowedDomains.length === 0) {
    throw new Error("浏览器托管授权至少需要一个 allowed domain");
  }
  if (allowedActions.includes("browser.submit")) {
    const resumeId = input.assetPolicy.resumeId;
    const resumeTitle = input.assetPolicy.resumeTitle;
    const resumeContentHash = input.assetPolicy.resumeContentHash;
    if (typeof resumeId !== "string" || !resumeId.trim() ||
        typeof resumeTitle !== "string" || !resumeTitle.trim() ||
        typeof resumeContentHash !== "string" ||
        !/^[0-9a-f]{64}$/u.test(resumeContentHash) ||
        input.assetPolicy.submissionMode !== "confirm_each") {
      throw new Error("托管投递必须冻结 Resume ID、标题、contentHash 并使用 confirm_each");
    }
    if (!allowedActions.includes("resume.read")) {
      throw new Error("托管投递必须授权读取已冻结的 Resume");
    }
  }
  if (allowedActions.some((value) => value.startsWith("mail."))) {
    const ids = input.connectorPolicy?.mailConnectionIds;
    const validIds = Array.isArray(ids) && ids.length > 0 &&
      ids.every((value) => typeof value === "string" && value.trim());
    const browserWebmail = input.connectorPolicy?.browserWebmail === true;
    if (!validIds && !browserWebmail) {
      throw new Error("邮箱托管授权必须允许 Browser Webmail 或选择已连接邮箱");
    }
    const browserMailActions = ["browser.read", "browser.control", "browser.write"];
    if (browserWebmail && (allowedDomains.length === 0 ||
        !browserMailActions.every((action) => allowedActions.includes(action)))) {
      throw new Error(
        "Browser Webmail 自动巡视需要 browser.read、browser.control、browser.write 与 allowed domain",
      );
    }
    if (allowedActions.includes("mail.classify") &&
        !allowedActions.includes("tracker.application.read")) {
      throw new Error("邮件分类必须同时授权读取 Application 候选");
    }
  }
  if (input.connectorPolicy?.appSchedule === true) {
    const directions = input.connectorPolicy.scheduleMailDirections;
    const validDirections = Array.isArray(directions) && directions.length > 0 &&
      directions.every((value) => value === "received" || value === "sent");
    const required = [
      "mail.read", "mail.classify", "tracker.application.read",
      "tracker.application.update", "tracker.interview.update",
    ];
    if (!validDirections || !required.every((action) => allowedActions.includes(action))) {
      throw new Error("App 日程联动必须冻结收/发件方向并授权邮件分类与 Tracker/Interview Proposal");
    }
  }
  return {
    ...structuredClone(input), conversationId, goal, allowedActions,
    expiresAt: new Date(expiresAt).toISOString(),
    allowedDomains, blockedDomains,
    ...(connectorPolicy ? { connectorPolicy } : {}),
  };
}

function normalizeDomains(values: string[]): string[] {
  return [...new Set(values.map((value) => {
    const domain = value.trim().toLowerCase().replace(/^\*\./u, "");
    if (!domain || domain.includes("/") || domain.includes(":")) {
      throw new Error(`无效授权 domain：${value}`);
    }
    return domain;
  }))].sort();
}

function expandKnownProviderDomains(domains: string[]): string[] {
  const outlook = [
    "outlook.live.com", "outlook.office.com", "outlook.cloud.microsoft",
    "login.live.com", "login.microsoftonline.com",
  ];
  const netease163 = ["mail.163.com", "hw.mail.163.com"];
  const expanded = [...domains];
  if (domains.some((domain) => outlook.includes(domain))) expanded.push(...outlook);
  if (domains.some((domain) => netease163.includes(domain))) expanded.push(...netease163);
  return [...new Set(expanded)].sort();
}
