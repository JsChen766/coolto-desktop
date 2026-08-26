import type { BrowserAgentStatusBridge } from "../browser/browser-agent-status-bridge.js";
import type { UserServices } from "../user-services.js";

export function bindBrowserAgentCommands(
  status: BrowserAgentStatusBridge,
  services: () => Promise<UserServices>,
): void {
  status.onCommand(async (command, taskId) => {
    const current = await services();
    if (command === "stop") {
      await current.agentTasks.cancel(taskId);
      return;
    }
    if (command === "resume") {
      await current.agentTasks.resume(taskId);
      return;
    }
    if (command === "takeover") {
      const task = await current.agentHarness.tasks.get(taskId);
      const occurredAt = new Date().toISOString();
      await current.agentHarness.events.enqueue({
        taskId, source: "user", type: "user.takeover",
        trust: "trusted_system", occurredAt,
        dedupeKey: `user.takeover:${taskId}:${occurredAt}`,
        payloadRef: null, payloadHash: task.goalHash,
      });
    }
    await current.agentTasks.pause(taskId);
    if (command === "takeover") {
      const state = status.get();
      if (state) status.set({
        ...state, status: "paused", control: "user",
        message: "用户已接管；交还前 Agent 不再观察或操作页面",
        updatedAt: new Date().toISOString(),
      });
    }
  });
}
