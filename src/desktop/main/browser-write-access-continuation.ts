import type { CooltoAgent } from "../../agent/coolto-agent.js";
import type { ApprovalDecision } from "../../approvals/types.js";
import { BROWSER_WRITE_ACCESS_ACTION_TYPE } from "../../browser/write-access-approval.js";
import { wrapInternalPrompt } from "../../agent/internal-prompt.js";

export interface BrowserWriteAccessContinuation {
  getGrantedReason: () => string | undefined;
}

/**
 * B3: 写权限授予后的续接。参考 JD 保存的 continuation 模式：审批通过后自动
 * prompt agent 一次，让它继续用户原本请求的写入任务，而不是停下等用户再喊一遍。
 */
export function prepareBrowserWriteAccessContinuation(
  agent: CooltoAgent,
  requestId: string,
  decision: ApprovalDecision,
): BrowserWriteAccessContinuation | undefined {
  if (decision.type !== "accept") return undefined;
  const pending = agent.getPendingApprovals();
  if (
    !pending.some(
      (p) => p.id === requestId && p.actionType === BROWSER_WRITE_ACCESS_ACTION_TYPE,
    )
  ) {
    return undefined;
  }
  let grantedReason: string | undefined;
  const unsub = agent.subscribe((event) => {
    if (
      event.type === "approval.completed" &&
      (event as { requestId: string }).requestId === requestId
    ) {
      const details = (event as { details?: unknown }).details as
        | { reason?: string }
        | undefined;
      grantedReason = details?.reason ?? "已授予";
    }
  });
  return {
    getGrantedReason: () => {
      unsub();
      return grantedReason;
    },
  };
}

export function buildBrowserWriteAccessContinuationPrompt(
  reason: string,
): string {
  return wrapInternalPrompt(
    `浏览器写权限已授予（意图：${reason}）。` +
    `请立即按用户之前的请求继续操作页面：` +
    `先用 browser_tag_elements 打标可操作元素，再按需调用 browser_fill_field/` +
    `browser_select_option/browser_set_checked/browser_click_element/browser_scroll_to。` +
    `完成本轮写入后，必须调用 browser_start_review 进入用户逐字段审核阶段——` +
    `不要跳过这一步，也永远不要点击提交/发送按钮。审核期间不要再调用任何 browser_* 写工具，` +
    `等待用户处理完毕。写权限 5 分钟无操作自动收回，请高效完成本轮写入。`,
  );
}
