import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";
import { ActionExecutorRegistry } from "../src/approvals/executor-registry.js";
import { AGENT_TASK_PROVISION_ACTION } from "../src/desktop/main/agent-task/agent-task-approval.js";
import { createAgentTaskApprovalExecutor } from "../src/desktop/main/agent-task/agent-task-approval-executor.js";
import { AgentTaskProposalService } from "../src/desktop/main/agent-task/agent-task-proposal-service.js";
import { createPrepareAgentTaskTool } from "../src/tools/prepare-agent-task.js";

function setup() {
  const services = new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository("owner", new MemoryAgentHarnessStatePersistence()),
  );
  const proposals = new AgentTaskProposalService(services);
  const executors = new ActionExecutorRegistry();
  executors.register(
    AGENT_TASK_PROVISION_ACTION,
    createAgentTaskApprovalExecutor(proposals),
  );
  const approvals = new ApprovalManager(new ApprovalStore(), executors);
  return { services, proposals, approvals };
}

const toolInput = () => ({
  goal: "Find backend roles",
  allowedDomains: ["jobs.example"],
  blockedDomains: [],
  allowedActions: ["browser.read", "browser.control", "task.lifecycle"],
  jobCriteria: { minimumMatch: 80 },
  assetPolicy: {}, answerPolicy: {}, unattended: true,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});

test("prepare_agent_task creates no task until immutable approval accepts", async () => {
  const value = setup();
  const tool = createPrepareAgentTaskTool({
    conversationId: "conversation",
    proposals: value.proposals,
    approvals: value.approvals,
  });
  const result = await tool.execute("prepare", toolInput());
  assert.equal((await value.services.tasks.list()).length, 0);
  const request = value.approvals.listPending()[0]!;
  assert.equal(request.actionType, AGENT_TASK_PROVISION_ACTION);
  assert.equal(result.details.approvalRequestId, request.id);

  await value.approvals.resolve(request.id, { type: "accept" });
  const tasks = await value.services.tasks.list();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.status, "queued");
});

test("rejected Agent task approval creates no task", async () => {
  const value = setup();
  const tool = createPrepareAgentTaskTool({
    conversationId: "conversation", proposals: value.proposals,
    approvals: value.approvals,
  });
  await tool.execute("prepare", toolInput());
  await value.approvals.resolve(value.approvals.listPending()[0]!.id, {
    type: "reject",
  });
  assert.equal((await value.services.tasks.list()).length, 0);
});
