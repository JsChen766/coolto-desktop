import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { BrowserAgentController } from "../../browser/agent-control-types.js";
import { browserControlResult } from "./browser-control-result.js";

const keypressParameters = Type.Object({
  key: Type.String({ minLength: 1, maxLength: 40 }),
  fillId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  modifiers: Type.Optional(Type.Array(Type.Union([
    Type.Literal("shift"), Type.Literal("control"),
    Type.Literal("alt"), Type.Literal("meta"),
  ]), { maxItems: 4 })),
});
const hoverParameters = Type.Object({
  fillId: Type.String({ minLength: 1, maxLength: 200 }),
});
const dragParameters = Type.Object({
  sourceFillId: Type.String({ minLength: 1, maxLength: 200 }),
  targetFillId: Type.String({ minLength: 1, maxLength: 200 }),
});

export function createBrowserInteractionTools(
  controller: BrowserAgentController,
): AgentTool[] {
  const precondition =
    "调用前必须 request_write_access；元素 fillId 必须来自当前页面最新一次 browser_tag_elements。";
  return [
    {
      name: "browser_keypress",
      label: "发送浏览器按键",
      description:
        "向可选 fillId（省略时为当前焦点）发送单个可打印字符或安全导航键。" +
        "Enter/NumpadEnter/Space 永久拒绝，" +
        "避免绕过提交/发送按钮保护。" + precondition,
      parameters: keypressParameters,
      execute: async (_id, input) => browserControlResult(async () => {
        await controller.keypress(input as never);
        const value = input as { key: string; fillId?: string };
        return { key: value.key, fillId: value.fillId, sent: true };
      }),
    },
    {
      name: "browser_hover",
      label: "悬停浏览器元素",
      description:
        "对指定 fillId 派发 hover/mouse 事件，用于展开菜单或 tooltip。" + precondition,
      parameters: hoverParameters,
      execute: async (_id, input) => browserControlResult(async () => {
        const fillId = (input as { fillId: string }).fillId;
        await controller.hover(fillId);
        return { fillId, hovered: true };
      }),
    },
    {
      name: "browser_drag",
      label: "拖拽浏览器元素",
      description:
        "把 sourceFillId 拖到 targetFillId，仅派发标准 drag/drop 事件。" + precondition,
      parameters: dragParameters,
      execute: async (_id, input) => browserControlResult(async () => {
        const value = input as { sourceFillId: string; targetFillId: string };
        await controller.drag(value.sourceFillId, value.targetFillId);
        return { ...value, dragged: true };
      }),
    },
  ];
}
