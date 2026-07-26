import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { BrowserPageOperator } from "../../browser/types.js";
import { isError, preflightWriteAccess } from "./write-tool-helpers.js";

const parameters = Type.Object({
  note: Type.Optional(
    Type.String({
      maxLength: 400,
      description:
        "可选：向用户简要说明本轮写入了哪些字段，作为进入审核提示的补充文本。",
    }),
  ),
});

/**
 * B4: 由 Agent 在完成一批写入后主动调用，向页面注入审核 Overlay，
 * 让用户逐字段接受/拒绝。调用后闸门进入 reviewing 状态，任何新的
 * 写原语一律返回 isError；用户处理完毕后主进程会 exitReview。
 */
export function createBrowserStartReviewTool(
  operator: BrowserPageOperator,
): AgentTool<typeof parameters> {
  return {
    name: "browser_start_review",
    label: "开始逐字段审核",
    description:
      "在你完成一批写入（fill / select / setChecked）后必须调用本工具，" +
      "向用户呈现 Overlay 让其逐字段接受/拒绝。调用后你不能再点击提交/发送，" +
      "也不能再调用任何 browser_* 写工具，直到用户在 Overlay 上处理完毕。" +
      "在 fillLog 为空、写权限未授予或已处于审核中时会返回 isError。",
    parameters,
    execute: async (_toolCallId, params) => {
      const pre = preflightWriteAccess(operator);
      if (pre) return pre;
      if (operator.isReviewing()) {
        return isError(
          "已有一轮审核尚未完成。请等待用户在 Overlay 上处理完所有字段。",
        );
      }
      const log = operator.getFillLog();
      if (log.length === 0) {
        return isError(
          "当前没有可审核的写入记录。请先用 browser_fill_field 等工具写入字段。",
        );
      }
      try {
        operator.enterReview();
      } catch (error: unknown) {
        return isError(
          error instanceof Error ? error.message : String(error),
        );
      }
      const summary = {
        recordCount: log.length,
        fillIds: log.map((r) => r.fillId),
        note: params.note ?? "",
        instruction:
          "已在页面上注入审核 Overlay。请等待用户在 Overlay 上逐字段决定，" +
          "不要再调用任何 browser_* 写工具；用户处理完毕后你会收到 " +
          "browser.review.complete 事件继续下一步。",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(summary) }],
        details: summary,
      };
    },
  };
}
