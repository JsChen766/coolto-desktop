import type { ApprovalDraft } from "../approvals/types.js";

export const BROWSER_WRITE_ACCESS_ACTION_TYPE = "browser.write_access";
export const BROWSER_WRITE_ACCESS_APPROVAL_SCOPE = "browser.write_access";

export interface BrowserWriteAccessApprovalPayload {
  reason: string;
  tabId: string | null;
  origin: string | null;
}

export function createBrowserWriteAccessApprovalDraft(
  payload: BrowserWriteAccessApprovalPayload,
): ApprovalDraft {
  const summary = [
    { label: "操作意图", value: payload.reason },
    ...(payload.origin
      ? [{ label: "作用站点", value: payload.origin }]
      : []),
  ];
  return {
    actionType: BROWSER_WRITE_ACCESS_ACTION_TYPE,
    scopeKey: BROWSER_WRITE_ACCESS_APPROVAL_SCOPE,
    risk: "write",
    title: "允许 AI 操作当前浏览器页面",
    description:
      "接受后 AI 可在当前活跃标签页填写、勾选、点击非提交按钮。" +
      "AI 永远不会点击提交/发送按钮，最终提交仍由你手动完成。" +
      "5 分钟无操作、切换到其他网站或你主动结束时权限自动收回。",
    preview: {
      summary,
      warnings: [
        "AI 不会点击提交/发送按钮；最终提交请你手动完成。",
        "写权限仅作用于当前标签页与当前网站，切换网站将自动失效。",
      ],
    },
  };
}

export function createBrowserWriteAccessApprovalPayload(
  reason: string,
  tabId: string | null,
  origin: string | null,
): BrowserWriteAccessApprovalPayload {
  return { reason, tabId, origin };
}

export function readBrowserWriteAccessPayload(
  payload: unknown,
): BrowserWriteAccessApprovalPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    typeof (payload as { reason?: unknown }).reason !== "string"
  ) {
    throw new Error("写权限审批 Payload 无效");
  }
  const raw = payload as {
    reason: string;
    tabId?: unknown;
    origin?: unknown;
  };
  return {
    reason: raw.reason,
    tabId: typeof raw.tabId === "string" ? raw.tabId : null,
    origin: typeof raw.origin === "string" ? raw.origin : null,
  };
}
