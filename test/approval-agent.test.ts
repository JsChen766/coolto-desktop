import assert from "node:assert/strict";
import test from "node:test";

import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";
import { ActionExecutorRegistry } from "../src/approvals/executor-registry.js";

test("custom approval response returns to the same agent as natural language", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage("好的，我会按新标题重新生成预览。"),
  ]);
  let rejected = false;
  const executors = new ActionExecutorRegistry();
  executors.register("test.write", {
    execute: async () => ({ summary: "unexpected" }),
    reject: () => {
      rejected = true;
    },
  });
  const approvals = new ApprovalManager(
    new ApprovalStore(),
    executors,
  );
  const request = await approvals.request(
    {
      actionType: "test.write",
      scopeKey: "test",
      risk: "write",
      title: "测试写入",
      description: "测试",
      preview: { summary: [] },
    },
    { value: "old" },
  );
  const agent = createCooltoAgent(
    {
      approvalManager: approvals,
      tools: [],
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  await agent.resolveApproval(request.id, {
    type: "custom",
    text: "把标题改成新标题",
  });

  assert.equal(rejected, true);
  assert.equal(faux.state.callCount, 1);
  assert.deepEqual(agent.getPendingApprovals(), []);
});
