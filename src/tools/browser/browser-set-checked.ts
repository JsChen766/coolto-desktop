import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { BrowserPageOperator } from "../../browser/types.js";
import { runWriteOperation } from "./write-tool-helpers.js";

const parameters = Type.Object({
  fillId: Type.String({ minLength: 1, maxLength: 200 }),
  checked: Type.Boolean({
    description: "true 勾选，false 取消勾选。radio 请传 true 来选中。",
  }),
});

/**
 * B3: 勾选/取消 input[type=checkbox|radio]。派发 input/change 事件兼容受控组件。
 */
export function createBrowserSetCheckedTool(
  operator: BrowserPageOperator,
): AgentTool<typeof parameters> {
  return {
    name: "browser_set_checked",
    label: "勾选/取消勾选",
    description:
      "勾选或取消 input[type=checkbox|radio]。派发 input/change 事件兼容 React/Vue" +
      "受控组件。仅支持原生 checkbox/radio；自定义开关组件应通过 browser_click_element。" +
      "需已授予写权限。",
    parameters,
    execute: async (_toolCallId, params) =>
      runWriteOperation(
        operator,
        () => operator.setChecked(params.fillId, params.checked),
        () => ({
          content: [
            {
              type: "text",
              text: `已${params.checked ? "勾选" : "取消勾选"}元素 ${params.fillId}。`,
            },
          ],
          details: { fillId: params.fillId, checked: params.checked },
        }),
      ),
  };
}
