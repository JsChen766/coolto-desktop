import assert from "node:assert/strict";
import test from "node:test";
import { childRequest, recoveryRequest } from "../src/desktop/main/tracker/tracker-ipc-validation.js";

test("Tracker IPC 只接受当前实体白名单字段", () => {
  assert.deepEqual(childRequest({ applicationId: " app ", value: { title: "提醒" } }, ["title"]), {
    applicationId: "app", id: undefined, value: { title: "提醒" },
  });
  assert.throws(() => childRequest({ applicationId: "app", value: { title: "提醒", admin: true } }, ["title"]), /未知字段/);
  assert.throws(() => childRequest({ applicationId: "app", value: {}, bypass: true }, []), /未知字段/);
});

test("Tracker 同步恢复 IPC 拒绝未知字段与非法操作", () => {
  assert.deepEqual(recoveryRequest({ entityType: "reminder", entityId: "r", action: "reapply" }), {
    entityType: "reminder", entityId: "r", action: "reapply",
  });
  assert.throws(() => recoveryRequest({ entityType: "reminder", entityId: "r", action: "force" }), /操作无效/);
  assert.throws(() => recoveryRequest({ entityType: "reminder", entityId: "r", action: "reapply", payload: {} }), /未知字段/);
});
