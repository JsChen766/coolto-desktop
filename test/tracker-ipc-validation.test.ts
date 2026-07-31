import assert from "node:assert/strict";
import test from "node:test";
import {
  childRequest, recoveryRequest,
  validateInterviewInput, validateNoteInput, validateReminderInput,
} from "../src/desktop/main/tracker/tracker-ipc-validation.js";

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

test("Interview IPC 校验类型和枚举", () => {
  const valid = validateInterviewInput({
    roundNumber: 1, interviewType: "phone", timezone: "Asia/Shanghai", status: "scheduled",
    scheduledAt: "2026-08-01T10:00:00+08:00", durationMinutes: 60,
  });
  assert.equal(valid.roundNumber, 1);
  assert.equal(valid.interviewType, "phone");
  assert.equal(valid.durationMinutes, 60);

  assert.throws(() => validateInterviewInput({
    roundNumber: "one", interviewType: "phone", timezone: "UTC", status: "scheduled",
  }), /正整数/);
  assert.throws(() => validateInterviewInput({
    roundNumber: 1, interviewType: "invalid", timezone: "UTC", status: "scheduled",
  }), /不合法/);
  assert.throws(() => validateInterviewInput({
    roundNumber: 1, interviewType: "phone", timezone: "UTC", status: "done",
  }), /不合法/);
  assert.throws(() => validateInterviewInput({
    roundNumber: 1, interviewType: "phone", timezone: "UTC", status: "scheduled",
    durationMinutes: 9999,
  }), /1–1440/);
});

test("Note IPC 校验类型和枚举", () => {
  const valid = validateNoteInput({ noteType: "general", content: "内容" });
  assert.equal(valid.noteType, "general");
  assert.equal(valid.content, "内容");

  assert.throws(() => validateNoteInput({ noteType: "invalid", content: "内容" }), /不合法/);
  assert.throws(() => validateNoteInput({ noteType: "general", content: 123 }), /字符串/);
  assert.throws(() => validateNoteInput({ noteType: "general", content: "" }), /不能为空/);
});

test("Reminder IPC 校验类型和枚举", () => {
  const valid = validateReminderInput({
    title: "提醒", remindAt: "2026-08-01T10:00:00Z", status: "scheduled",
  });
  assert.equal(valid.title, "提醒");
  assert.equal(valid.status, "scheduled");

  assert.throws(() => validateReminderInput({
    title: "提醒", remindAt: "2026-08-01T10:00:00Z", status: "invalid",
  }), /不合法/);
  assert.throws(() => validateReminderInput({
    title: 123, remindAt: "2026-08-01T10:00:00Z", status: "scheduled",
  }), /字符串/);
});
