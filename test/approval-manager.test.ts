import assert from "node:assert/strict";
import test from "node:test";

import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";
import {
  ActionExecutorRegistry,
  type ActionExecutor,
} from "../src/approvals/executor-registry.js";
import type {
  ApprovalDecision,
  ApprovalEvent,
} from "../src/approvals/types.js";

test("approval manager executes an immutable payload only once", async () => {
  const executed: unknown[] = [];
  const { manager, events } = createManager({
    execute: async ({ payload }) => {
      executed.push(payload);
      return { summary: "saved" };
    },
  });
  const payload = { title: "Original" };
  const request = await manager.request(createDraft(), payload);
  payload.title = "Changed after preview";

  await manager.resolve(request.id, { type: "accept" });
  assert.deepEqual(executed, [{ title: "Original" }]);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "approval.required",
      "approval.resolved",
      "approval.executing",
      "approval.completed",
    ],
  );
  await assert.rejects(
    manager.resolve(request.id, { type: "accept" }),
    /不存在、已失效或已处理/,
  );
});

test("empty custom response is rejected without consuming approval", async () => {
  const { manager } = createManager({
    execute: async () => ({ summary: "unexpected" }),
  });
  const request = await manager.request(createDraft(), {});
  await assert.rejects(
    manager.resolve(request.id, { type: "custom", text: "  " }),
    /不能为空/,
  );
  assert.equal(manager.listPending()[0]?.id, request.id);
});

test("reject and custom decisions never execute the action", async () => {
  const decisions: ApprovalDecision[] = [
    { type: "reject" },
    { type: "custom", text: "请修改标题" },
  ];
  for (const decision of decisions) {
    let executed = false;
    let rejected = false;
    const { manager } = createManager({
      execute: async () => {
        executed = true;
        return { summary: "unexpected" };
      },
      reject: () => {
        rejected = true;
      },
    });
    const request = await manager.request(createDraft(), {});
    await manager.resolve(request.id, decision);
    assert.equal(executed, false);
    assert.equal(rejected, true);
  }
});

test("a new proposal replaces and cleans up the same approval scope", async () => {
  const rejected: unknown[] = [];
  const { manager } = createManager({
    execute: async () => ({ summary: "saved" }),
    reject: ({ payload }) => {
      rejected.push(payload);
    },
  });
  const first = await manager.request(createDraft(), { version: 1 });
  const second = await manager.request(createDraft(), { version: 2 });

  assert.deepEqual(rejected, [{ version: 1 }]);
  assert.deepEqual(
    manager.listPending().map((request) => request.id),
    [second.id],
  );
  await assert.rejects(
    manager.resolve(first.id, { type: "accept" }),
    /不存在、已失效或已处理/,
  );
});

function createManager(executor: ActionExecutor) {
  const registry = new ActionExecutorRegistry();
  registry.register("test.write", executor);
  const manager = new ApprovalManager(new ApprovalStore(), registry);
  const events: ApprovalEvent[] = [];
  manager.subscribe((event) => {
    events.push(event);
  });
  return { manager, events };
}

function createDraft() {
  return {
    actionType: "test.write",
    scopeKey: "test",
    risk: "write" as const,
    title: "测试写入",
    description: "测试",
    preview: {
      summary: [{ label: "字段", value: "值" }],
    },
  };
}
