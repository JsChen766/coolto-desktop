import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { BrowserPageOperator } from "../../browser/types.js";
import { runWriteOperation } from "./write-tool-helpers.js";

const parameters = Type.Object({
  fillId: Type.String({ minLength: 1, maxLength: 200 }),
});

/**
 * B3: 点击元素。硬约束：提交/发送按钮拒绝执行。
 * 判定由主进程 evaluateClickTarget 完成（type + 文案正则）；
 * Agent 层禁止尝试绕过或用其他手段触发提交。
 */
export function createBrowserClickElementTool(
  operator: BrowserPageOperator,
): AgentTool<typeof parameters> {
  return {
    name: "browser_click_element",
    label: "点击元素",
    description:
      "点击页面元素（button、a、可点击 div 等）。硬约束：Agent 永远不得点击提交、投递、" +
      "申请、发送、submit、send、apply 等提交/发送类按钮——主进程会通过类型 + 文案正则拒绝" +
      "这类元素，返回 isError；最终提交由用户手动完成。允许的用途包括：展开更多、切换 Tab、" +
      "打开自定义下拉、勾选自定义选项等非提交交互。需已授予写权限。",
    parameters,
    execute: async (_toolCallId, params) =>
      runWriteOperation(
        operator,
        () => operator.clickElement(params.fillId),
        () => ({
          content: [
            { type: "text", text: `已点击元素 ${params.fillId}。` },
          ],
          details: { fillId: params.fillId },
        }),
      ),
  };
}
