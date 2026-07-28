import type { ApprovalEvent } from "../../approvals/types.js";
import { JD_SAVE_ACTION_TYPE } from "../../jd/approval-draft.js";
import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { ApprovalDecision } from "../../approvals/types.js";
import { wrapInternalPrompt } from "../../agent/internal-prompt.js";

export interface JdContinuationResult {
  getSavedJd: () => { jdId: string; title: string } | undefined;
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
  let savedJd: { jdId: string; title: string } | undefined;
  const unsub = agent.subscribe((event) => {
    if (
      event.type === "approval.completed" &&
      (event as ApprovalEvent & { requestId: string }).requestId === requestId
    ) {
      const details = (event as { details?: unknown }).details as
        | { jdId?: string; title?: string }
        | undefined;
      if (details?.jdId && details.title) {
        savedJd = { jdId: details.jdId, title: details.title };
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

export function buildJdContinuationPrompt(jd: { jdId: string; title: string }): string {
  return wrapInternalPrompt(
    `JD「${jd.title}」已保存到本地同步队列（jdId: ${jd.jdId}）。` +
    `请根据对话历史中用户的原始意图继续下一步操作。` +
    `如果用户原本要求根据此 JD 生成简历，请使用 jdId 继续执行；` +
    `否则简要确认 JD 已保存并等待同步即可。`,
  );
}
