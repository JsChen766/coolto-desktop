import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { BrowserPageOperator } from "../../browser/types.js";
import { runWriteOperation } from "./write-tool-helpers.js";

const parameters = Type.Object({
  fillId: Type.String({ minLength: 1, maxLength: 200 }),
});

/**
 * B3: 滚动到指定元素，确保可见。写权限闸门约束。
 */
export function createBrowserScrollToTool(
  operator: BrowserPageOperator,
): AgentTool<typeof parameters> {
  return {
    name: "browser_scroll_to",
    label: "滚动到元素",
    description:
      "滚动页面，把指定元素移到视口中央；用于长表单填写前先让字段可见。需已授予写权限。",
    parameters,
    execute: async (_toolCallId, params) =>
      runWriteOperation(
        operator,
        () => operator.scrollTo(params.fillId),
        () => ({
          content: [
            { type: "text", text: `已滚动到元素 ${params.fillId}。` },
          ],
          details: { fillId: params.fillId },
        }),
      ),
  };
}
