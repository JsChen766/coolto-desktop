import type { BrowserPageOperator } from "../../browser/types.js";
import type { BrowserAgentStatusBridge } from "./browser/browser-agent-status-bridge.js";
import type { UserServices } from "./user-services-contract.js";

export async function clearUserServices(input: {
  current: UserServices | undefined;
  reason: "window_closed" | "account_changed";
  browser: BrowserPageOperator;
  status: BrowserAgentStatusBridge;
}): Promise<void> {
  input.browser.revokeWriteAccess(input.reason);
  input.status.clear();
  const current = input.current;
  if (!current) return;
  await current.agentTaskScheduler.quiesce();
  await current.reminderScheduler.quiesce();
  await current.agent.quiesce();
  await current.material?.host.close().catch(() => undefined);
  current.selectedFiles.clear();
  await current.deliveryResumeFiles.clearStaging();
  await current.onboardingBrowser?.cleanup().catch(() => undefined);
  if (input.reason !== "account_changed") return;
  const tasks = await current.agentHarness.tasks.list();
  for (const task of tasks) {
    const active = await current.agentHarness.grants.getActive(task.id);
    if (active.grant && !active.revocation &&
        !["completed", "partially_completed", "canceled", "expired"].includes(task.status)) {
      await current.agentHarness.grants.revoke(task.id, "account_changed");
    }
  }
}
