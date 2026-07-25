import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { BrowserPageOperator } from "../../browser/types.js";
import { runWriteOperation } from "./write-tool-helpers.js";

const parameters = Type.Object({
  fillId: Type.String({ minLength: 1, maxLength: 200 }),
  value: Type.String({
    minLength: 1,
    maxLength: 500,
    description:
      "要选中的 option 值；优先匹配 option.value，退回匹配 option 显示文本（trim 后严格相等）。",
  }),
});

/**
 * B3: 设置原生 <select> 的当前选项。仅支持原生 select；自定义下拉组件请用点击组合。
 */
export function createBrowserSelectOptionTool(
  operator: BrowserPageOperator,
): AgentTool<typeof parameters> {
  return {
    name: "browser_select_option",
    label: "选择下拉选项",
    description:
      "设置原生 <select> 元素的当前选项。会先匹配 option.value，若未命中再匹配显示文本" +
      "（trim 后严格相等）。仅支持原生 select 元素；自定义下拉（如 Ant Design Select）应" +
      "通过 browser_click_element 组合点击。需已授予写权限。",
    parameters,
    execute: async (_toolCallId, params) =>
      runWriteOperation(
        operator,
        () => operator.selectOption(params.fillId, params.value),
        () => ({
          content: [
            {
              type: "text",
              text: `已在 select ${params.fillId} 选中「${params.value}」。`,
            },
          ],
          details: { fillId: params.fillId, value: params.value },
        }),
      ),
  };
}
