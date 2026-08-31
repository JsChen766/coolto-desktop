import type {
  BrowserAgentActionImpact,
  BrowserAgentActionKind,
} from "../desktop/shared/types/browser-agent.js";

export function browserAgentActionForTool(toolName: string): {
  impact: BrowserAgentActionImpact;
  kind: BrowserAgentActionKind;
} {
  if (["browser_snapshot", "extract_page", "browser_query_elements",
    "browser_wait", "browser_list_tabs", "browser_get_active_tab"]
    .includes(toolName)) return { impact: "read", kind: "observe" };
  if (["browser_navigate", "browser_go_back", "browser_go_forward",
    "browser_reload"].includes(toolName)) {
    return { impact: "page_change", kind: "navigate" };
  }
  if (["browser_new_tab", "browser_select_tab", "browser_close_tab"]
    .includes(toolName)) return { impact: "page_change", kind: "tab" };
  if (toolName === "browser_download") {
    return { impact: "page_change", kind: "download" };
  }
  if (toolName === "browser_submit") {
    return { impact: "external_commitment", kind: "submit" };
  }
  if (toolName.includes("review")) return { impact: "page_change", kind: "review" };
  if (toolName.startsWith("browser_") || toolName === "request_write_access") {
    return { impact: "page_change", kind: "fill" };
  }
  return { impact: "read", kind: "other" };
}
