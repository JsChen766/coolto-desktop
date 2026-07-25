import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ApprovalManager } from "../../approvals/approval-manager.js";
import type { BrowserPageOperator } from "../../browser/types.js";
import { createRequestWriteAccessTool } from "./request-write-access.js";
import { createBrowserTagElementsTool } from "./browser-tag-elements.js";
import { createBrowserFillFieldTool } from "./browser-fill-field.js";
import { createBrowserSelectOptionTool } from "./browser-select-option.js";
import { createBrowserSetCheckedTool } from "./browser-set-checked.js";
import { createBrowserClickElementTool } from "./browser-click-element.js";
import { createBrowserScrollToTool } from "./browser-scroll-to.js";

/**
 * B3: 组装浏览器写工具集。写权限闸门（request_write_access）依赖 ApprovalManager；
 * 写原语依赖 BrowserPageOperator。缺少任一依赖时对应工具不注册。
 */
export function createBrowserWriteTools(
  operator: BrowserPageOperator,
  approvalManager: ApprovalManager,
): AgentTool[] {
  return [
    createRequestWriteAccessTool(operator, approvalManager),
    createBrowserTagElementsTool(operator),
    createBrowserFillFieldTool(operator),
    createBrowserSelectOptionTool(operator),
    createBrowserSetCheckedTool(operator),
    createBrowserClickElementTool(operator),
    createBrowserScrollToTool(operator),
  ];
}
