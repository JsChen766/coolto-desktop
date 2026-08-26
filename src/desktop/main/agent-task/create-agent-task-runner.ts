import { AgentTaskRunner } from "../../../agent-task/agent-task-runner.js";
import type { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import type { DesktopAgentRuntime } from "../agent-runtime.js";
import type { BrowserAgentStatusBridge } from "../browser/browser-agent-status-bridge.js";
import type { BrowserPageOperator } from "../../../browser/types.js";
import type { AgentTaskV1 } from "../../../agent-task/task-types.js";
import type { BrowserAgentControlState } from "../../shared/types.js";
import { AgentTaskScheduler } from "../../../agent-task/agent-task-scheduler.js";

export async function createAgentTaskRuntime(
  services: AgentHarnessServices,
  agent: DesktopAgentRuntime,
  status: BrowserAgentStatusBridge,
  browser: BrowserPageOperator,
): Promise<{ agentTasks: AgentTaskRunner; agentTaskScheduler: AgentTaskScheduler }> {
  const agentTasks = new AgentTaskRunner(services, {
    prompt: async (conversationId, content) => {
      await agent.prompt({ conversationId, text: content });
    },
    cancel: () => agent.cancel(),
    revokeBrowserAccess: (reason) => browser.revokeWriteAccess(reason),
  }, (task) => status.set(
    ["completed", "partially_completed", "failed", "canceled", "expired"]
      .includes(task.status) ? null : toBrowserState(task),
  ));
  const agentTaskScheduler = new AgentTaskScheduler(services, agentTasks);
  await agentTasks.recoverInterrupted();
  agentTaskScheduler.start();
  return { agentTasks, agentTaskScheduler };
}

export function toBrowserState(task: AgentTaskV1): BrowserAgentControlState {
  return {
    taskId: task.id,
    goal: task.goal,
    status: task.status,
    control: "agent",
    message: task.status === "running"
      ? "Agent 正在执行原子浏览器任务"
      : task.waiting?.reason ?? task.status,
    updatedAt: task.updatedAt,
  };
}
