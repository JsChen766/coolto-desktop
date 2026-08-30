import { projectBrowserAgentChrome } from "../browser/browser-agent-projection.js";
import type { BrowserPageOperator } from "../browser/types.js";
import type { BrowserWindowManager } from
  "../desktop/main/browser/browser-window-manager.js";
import type {
  BrowserAgentChromeView,
  BrowserAgentProjectionFacts,
} from "../desktop/shared/types.js";

export function browserAgentQaView(
  changes: Partial<BrowserAgentProjectionFacts> = {},
): BrowserAgentChromeView {
  return projectBrowserAgentChrome({
    task: {
      goal: "读取测试页面并报告结果",
      status: "running",
      waitingReason: null,
      updatedAt: new Date().toISOString(),
    },
    control: "agent",
    modelActive: true,
    currentAction: {
      kind: "observe",
      impact: "read",
      targetOrigin: "http://127.0.0.1",
      targetTabId: null,
      startedAt: new Date().toISOString(),
    },
    delegation: {
      domains: ["127.0.0.1"],
      capabilities: ["read", "control"],
      unattended: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null,
    },
    pageAccess: {
      mode: "read_only", origin: "http://127.0.0.1", targetTabId: null,
    },
    review: null,
    activity: [],
    commandError: null,
    commandPending: false,
    ...changes,
  })!;
}

export async function browserTargetHighlightObserved(
  operator: BrowserPageOperator,
  manager: BrowserWindowManager,
  fillId: string,
): Promise<boolean> {
  await operator.scrollTo(fillId);
  const contents = manager.tabs?.activeTab()?.view.webContents;
  if (!contents) return false;
  return (await contents.executeJavaScript(
    "globalThis.__targetHighlightAdds ?? 0", true,
  ) as number) > 0;
}
