import type { ApprovalEvent } from "../../approvals/types.js";
import { JD_SAVE_ACTION_TYPE } from "../../jd/approval-draft.js";
import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { ApprovalDecision } from "../../approvals/types.js";
import { wrapInternalPrompt } from "../../agent/internal-prompt.js";
import { projectConversationMessages } from "./conversation-presentation.js";
import { appendControlledAssistantMessage } from "./resume-run-feedback.js";
import type { AgentRuntimeEvents } from "./agent-runtime-events.js";

const RESUME_START_NOTICE =
  "OK，已经确认要生成简历了，我现在开始生成。";

export interface JdContinuationResult {
  getSavedJd: () => {
    jdId: string;
    title: string;
    resumeRequested: boolean;
  } | undefined;
}

export function prepareJdContinuation(
  agent: CooltoAgent,
  requestId: string,
  decision: ApprovalDecision,
): JdContinuationResult | undefined {
  if (decision.type !== "accept") return undefined;
  const pending = agent.getPendingApprovals();
  if (!pending.some((p) => p.id === requestId && p.actionType === JD_SAVE_ACTION_TYPE)) {
    return undefined;
  }
  const resumeRequested = resumeGenerationWasRequested(agent.getMessages());
  let savedJd: {
    jdId: string;
    title: string;
    resumeRequested: boolean;
  } | undefined;
  const unsub = agent.subscribe((event) => {
    if (
      event.type === "approval.completed" &&
      (event as ApprovalEvent & { requestId: string }).requestId === requestId
    ) {
      const details = (event as { details?: unknown }).details as
        | { jdId?: string; title?: string }
        | undefined;
      if (details?.jdId && details.title) {
        savedJd = { jdId: details.jdId, title: details.title, resumeRequested };
      }
    }
  });
  return {
    getSavedJd: () => {
      unsub();
      return savedJd;
    },
  };
}

export function resumeGenerationWasRequested(messages: ReturnType<CooltoAgent["getMessages"]>): boolean {
  const users = projectConversationMessages(messages)
    .filter((message) => message.role === "user")
    .map((message) => message.content);
  for (const text of users.reverse()) {
    if (/不(?:要)?(?:生成|制作|做|写).{0,8}简历|只保存.{0,12}(?:JD|岗位)/iu.test(text)) {
      return false;
    }
    if (/(?:生成|制作|做|写|准备).{0,10}简历|简历.{0,10}(?:生成|制作|开始)/iu.test(text)) {
      return true;
    }
    if (/JD|岗位/iu.test(text)) return false;
  }
  return false;
}

export function announceResumeGenerationStart(
  agent: CooltoAgent,
  events: AgentRuntimeEvents,
  conversationId: string,
): void {
  const timestamp = Date.now();
  agent.replaceMessages(appendControlledAssistantMessage(
    agent.getMessages(), RESUME_START_NOTICE, timestamp,
  ));
  events.emitAssistantNotice(conversationId, RESUME_START_NOTICE, timestamp);
}

export function buildJdContinuationPrompt(jd: { jdId: string; title: string }): string {
  return wrapInternalPrompt(
    `JD「${jd.title}」已保存到本地同步队列（jdId: ${jd.jdId}）。` +
    `请根据对话历史中用户当前最新、明确的意图继续下一步操作；若用户已修改或取消原始目标，不得继续旧目标。` +
    `如果用户原本要求根据此 JD 生成简历，请使用 jdId 继续执行；` +
    `否则简要确认 JD 已保存并等待同步即可。`,
  );
}
