import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { ApprovalManager } from "../../approvals/approval-manager.js";
import type { BrowserPageOperator } from "../../browser/types.js";
import {
  createBrowserWriteAccessApprovalDraft,
  createBrowserWriteAccessApprovalPayload,
} from "../../browser/write-access-approval.js";

const parameters = Type.Object({
  reason: Type.String({
    minLength: 4,
    maxLength: 200,
    description:
      "向用户解释为何需要写权限（例如「填写 Boss 直聘投递表单」）。" +
      "文案会展示在审批卡片上，请写清楚具体网站/操作意图。",
  }),
});

/**
 * B3: 写权限闸门。所有 browser_* 写工具的前置依赖。
 * 复用 ApprovalManager 弹审批卡，用户点接受后 executor 翻主进程标志位。
 * Agent 无法自行开启写权限；页面注入的不可信文本骗不过主进程。
 */
export function createRequestWriteAccessTool(
  operator: BrowserPageOperator,
  approvalManager: ApprovalManager,
): AgentTool<typeof parameters> {
  return {
    name: "request_write_access",
    label: "请求浏览器写权限",
    description:
      "在控制内置浏览器（新建/切换/关闭标签、导航/前进/后退/刷新），或向页面写入任何内容" +
      "（填字段/勾选/点击/滚动/打标 data-fill-id）之前，" +
      "必须先调用本工具请求写权限。工具会弹出用户审批卡片，用户点击接受后，主进程才会" +
      "翻开写权限标志位。写权限自动失效：切到别的网站、5 分钟无操作、用户主动结束时收回。" +
      "永远不要尝试自行开启或绕过写权限。",
    parameters,
    execute: async (_toolCallId, params) => {
      if (operator.isWriteAccessGranted()) {
        return {
          content: [
            {
              type: "text",
              text: "写权限已授予；可直接使用 browser_tag_elements / browser_fill_field 等写工具。",
            },
          ],
          details: { alreadyGranted: true },
        };
      }
      const payload = createBrowserWriteAccessApprovalPayload(
        params.reason,
        null,
        null,
      );
      const approval = await approvalManager.request(
        createBrowserWriteAccessApprovalDraft(payload),
        payload,
      );
      const summary = {
        approvalRequestId: approval.id,
        reason: params.reason,
        instruction:
          "已弹出用户审批卡片。请简要说明将做什么并等待用户决定，不要要求用户输入确认短语；" +
          "用户接受后你才可以调用其他 browser_* 写工具。",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(summary) }],
        details: summary,
      };
    },
  };
}
