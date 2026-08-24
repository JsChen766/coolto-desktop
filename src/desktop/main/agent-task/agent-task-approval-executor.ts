import type { ActionExecutor } from "../../../approvals/executor-registry.js";
import type { AgentTaskProposalService } from "./agent-task-proposal-service.js";

export function createAgentTaskApprovalExecutor(
  proposals: AgentTaskProposalService,
): ActionExecutor {
  return {
    execute: async ({ payload }) => {
      const proposalId = readProposalId(payload);
      const taskId = await proposals.execute(proposalId);
      return {
        summary: "Agent 任务授权已确认，等待启动。",
        details: { proposalId, taskId },
      };
    },
  };
}

function readProposalId(payload: unknown): string {
  if (!payload || typeof payload !== "object" ||
      typeof (payload as { proposalId?: unknown }).proposalId !== "string") {
    throw new Error("AgentTask approval payload 无效");
  }
  return (payload as { proposalId: string }).proposalId;
}
