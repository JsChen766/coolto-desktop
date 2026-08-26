import { canonicalHash } from "../../../agent-task/canonical-hash.js";
import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import type { JsonValue } from "../../../agent-task/json-types.js";
import { uuidV7 } from "../../../agent-task/uuid-v7.js";
import type {
  AgentTaskDelegationInput,
  AgentTaskProposalView,
} from "../../shared/types.js";

const ALLOWED_ACTIONS = new Set([
  "browser.read", "browser.control", "browser.write", "browser.download",
  "browser.request_access", "browser.review", "task.lifecycle",
  "jobs.search", "jobs.evaluate",
  "browser.submit", "tracker.application.create",
  "answers.read", "answers.prepare",
  "mail.read", "mail.classify",
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
  if (Date.parse(input.expiresAt) <= Date.now()) throw new Error("DelegationGrant 已过期");
  const allowedActions = [...new Set(input.allowedActions.map((value) => value.trim()))]
    .filter(Boolean).sort();
  if (allowedActions.includes("mail.send")) throw new Error("mail.send 永远不能托管授权");
  const invalid = allowedActions.filter((value) => !ALLOWED_ACTIONS.has(value));
  if (invalid.length) throw new Error(`BE2 不支持授权动作：${invalid.join(", ")}`);
  const allowedDomains = normalizeDomains(input.allowedDomains);
  const blockedDomains = normalizeDomains(input.blockedDomains);
  if (allowedActions.some((value) => value.startsWith("browser.")) &&
      allowedDomains.length === 0) {
    throw new Error("浏览器托管授权至少需要一个 allowed domain");
  }
  if (allowedActions.some((value) => value.startsWith("mail."))) {
    const ids = input.connectorPolicy?.mailConnectionIds;
    const validIds = Array.isArray(ids) && ids.length > 0 &&
      ids.every((value) => typeof value === "string" && value.trim());
    const browserWebmail = input.connectorPolicy?.browserWebmail === true;
    if (!validIds && !browserWebmail) {
      throw new Error("邮箱托管授权必须允许 Browser Webmail 或选择已连接邮箱");
    }
    if (browserWebmail &&
        (!allowedActions.includes("browser.read") || allowedDomains.length === 0)) {
      throw new Error("Browser Webmail 需要 browser.read 与 allowed domain");
    }
  }
  return {
    ...structuredClone(input), conversationId, goal, allowedActions,
    allowedDomains, blockedDomains,
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
