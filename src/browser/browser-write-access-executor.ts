import type { BrowserPageOperator } from "../browser/types.js";
import type {
  ActionExecutionContext,
  ActionExecutor,
} from "../approvals/executor-registry.js";
import { readBrowserWriteAccessPayload } from "./write-access-approval.js";

/**
 * B3: 浏览器写权限审批 executor。用户在聊天里点击「接受」时被调用，
 * 翻主进程 write-enable 标志位；点「拒绝」则不做任何事（闸门保持未授予）。
 * 与 JD 保存 executor 走同一套 ApprovalManager 流程，不新建审批机制。
 */
export function createBrowserWriteAccessExecutor(
  operator: BrowserPageOperator,
): ActionExecutor {
  return {
    execute: async (context: ActionExecutionContext) => {
      const payload = readBrowserWriteAccessPayload(context.payload);
      operator.grantWriteAccess(payload.reason);
      return {
        summary: "已授予当前浏览器页面写权限（5 分钟无操作自动收回）",
        details: {
          origin: payload.origin,
          reason: payload.reason,
        },
      };
    },
    reject: () => {
      // 拒绝时不做操作；闸门保持关闭，Agent 后续任意写工具将返回 isError。
    },
  };
}
