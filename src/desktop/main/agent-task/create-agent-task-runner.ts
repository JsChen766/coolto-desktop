import { AgentTaskRunner } from "../../../agent-task/agent-task-runner.js";
import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import type { DesktopAgentRuntime } from "../agent-runtime.js";
import type { BrowserAgentStatusBridge } from "../browser/browser-agent-status-bridge.js";
import type { BrowserPageOperator } from "../../../browser/types.js";
import type { BrowserAgentController } from "../../../browser/agent-control-types.js";
import { AgentTaskScheduler } from "../../../agent-task/agent-task-scheduler.js";
import { BrowserAgentProjectionCoordinator } from "./browser-agent-projection-coordinator.js";

export async function createAgentTaskRuntime(
  services: AgentHarnessServices,
  agent: DesktopAgentRuntime,
  status: BrowserAgentStatusBridge,
  browser: BrowserPageOperator,
  browserController: BrowserAgentController,
): Promise<{ agentTasks: AgentTaskRunner; agentTaskScheduler: AgentTaskScheduler }> {
  const projection = new BrowserAgentProjectionCoordinator(
    services, status, browserController, browser,
  );
  status.bindSource(() => projection.dispose());
  const agentTasks = new AgentTaskRunner(services, {
    prompt: async (conversationId, content) => {
      await agent.prompt({ conversationId, text: content });
    },
    cancel: () => agent.cancel(),
    revokeBrowserAccess: (reason) => browser.revokeWriteAccess(reason),
  }, (task) => projection.taskChanged(task));
  const agentTaskScheduler = new AgentTaskScheduler(services, agentTasks);
  await agentTasks.recoverInterrupted();
  await projection.initialize();
  agentTaskScheduler.start();
  return { agentTasks, agentTaskScheduler };
}
