import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { BrowserPageOperator } from "../../browser/types.js";
import { runWriteOperation } from "./write-tool-helpers.js";

const parameters = Type.Object({
  fillId: Type.String({
    minLength: 1,
    maxLength: 200,
    description: "由 browser_tag_elements 返回的元素 fillId。",
  }),
  value: Type.String({
    maxLength: 20_000,
    description:
      "要写入的文本值。会通过原生 setter + input/change 事件写入，兼容 React/Vue 受控组件。",
  }),
});

/**
 * B3: 向 input/textarea 字段写入文本。密码字段与 file 字段拒绝写入。
 * 未授予写权限、元素不存在/不可写、类型不匹配时返回 isError。
 */
export function createBrowserFillFieldTool(
  operator: BrowserPageOperator,
): AgentTool<typeof parameters> {
  return {
    name: "browser_fill_field",
    label: "填写文本字段",
    description:
      "向 input（非 password/file）或 textarea 字段写入文本。fillId 由 browser_tag_elements" +
      "返回。会派发 input/change 事件，兼容 React/Vue 受控组件。密码字段与文件字段禁止使用" +
      "本工具。需已授予写权限。",
    parameters,
    execute: async (_toolCallId, params) =>
      runWriteOperation(
        operator,
        () => operator.fillField(params.fillId, params.value),
        () => ({
          content: [
            {
              type: "text",
              text: `已在字段 ${params.fillId} 写入文本（长度 ${params.value.length}）。`,
            },
          ],
          details: { fillId: params.fillId, length: params.value.length },
        }),
      ),
  };
}
