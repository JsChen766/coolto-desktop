import { AgentTaskRunner } from "../../../agent-task/agent-task-runner.js";
import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import type { DesktopAgentRuntime } from "../agent-runtime.js";
import type { BrowserAgentStatusBridge } from "../browser/browser-agent-status-bridge.js";
import type { BrowserPageOperator } from "../../../browser/types.js";
import type { BrowserAgentController } from "../../../browser/agent-control-types.js";
import { AgentTaskScheduler } from "../../../agent-task/agent-task-scheduler.js";
import { BrowserAgentProjectionCoordinator } from "./browser-agent-projection-coordinator.js";
import type { BrowserState } from "../../shared/types.js";

export async function createAgentTaskRuntime(
  services: AgentHarnessServices,
  agent: DesktopAgentRuntime,
  status: BrowserAgentStatusBridge,
  browser: BrowserPageOperator,
  browserController: BrowserAgentController,
  openVisibleBrowser: () => BrowserState | Promise<BrowserState>,
  cleanupTask: (taskId: string) => Promise<void>,
): Promise<{ agentTasks: AgentTaskRunner; agentTaskScheduler: AgentTaskScheduler }> {
  const projection = new BrowserAgentProjectionCoordinator(
    services, status, browserController, browser,
  );
  status.bindSource(() => projection.dispose());
  const changed = async (task: import("../../../agent-task/task-types.js").AgentTaskV1) => {
    await projection.taskChanged(task);
    if (["completed", "partially_completed", "failed", "canceled", "expired"]
      .includes(task.status)) await cleanupTask(task.id).catch(() => undefined);
  };
  const agentTasks = new AgentTaskRunner(services, {
    prompt: async (conversationId, content) => {
      await agent.prompt({ conversationId, text: content });
    },
    cancel: () => agent.cancel(),
    revokeBrowserAccess: (reason) => browser.revokeWriteAccess(reason),
    cleanupTask,
  }, changed);
  const agentTaskScheduler = new AgentTaskScheduler(
    services,
    agentTasks,
    async (taskId) => {
      if (agent.isRunning) throw new Error("Agent runtime 正在完成当前审批");
      const active = await services.grants.getActive(taskId);
      const needsBrowser = active.grant?.allowedActions
        .some((action) => action.startsWith("browser."));
      if (!needsBrowser) return;
      if (!(await openVisibleBrowser()).isOpen) {
        throw new Error("可见浏览器未能打开，Agent 任务保持等待");
      }
    },
  );
  await agentTasks.recoverInterrupted();
  await projection.initialize();
  agentTaskScheduler.start();
  return { agentTasks, agentTaskScheduler };
}
