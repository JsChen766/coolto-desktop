import assert from "node:assert/strict";
import test from "node:test";

import type { DesktopApprovalRequest } from
  "../src/desktop/shared/types.js";
import { refreshPendingApproval } from
  "../src/desktop/renderer/src/chat/pending-approval-projection.js";

test("pending approval projection recovers the latest request", async () => {
  const cache = new Map<string, DesktopApprovalRequest>();
  const older = request("older", "2026-08-29T10:00:00.000Z");
  const latest = request("latest", "2026-08-29T10:01:00.000Z");
  const value = await refreshPendingApproval(
    "conversation-1", cache, async () => [older, latest],
  );
  assert.equal(value?.id, "latest");
  assert.equal(cache.get("conversation-1")?.id, "latest");
});

test("pending approval projection clears a stale cached request", async () => {
  const cache = new Map([["conversation-1", request("stale", "2026-08-29T10:00:00.000Z")]]);
  const value = await refreshPendingApproval(
    "conversation-1", cache, async () => [],
  );
  assert.equal(value, undefined);
  assert.equal(cache.has("conversation-1"), false);
});

function request(id: string, createdAt: string): DesktopApprovalRequest {
  return {
    id,
    actionType: "agent_task.provision",
    risk: "external",
    title: "允许 Agent 读取指定邮箱",
    description: "仅限用户确认的 Webmail 只读任务",
    preview: { summary: [] },
    createdAt,
  };
}
