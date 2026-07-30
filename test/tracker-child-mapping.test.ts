import assert from "node:assert/strict";
import test from "node:test";

import { interviewWritePayload, toInterview } from "../src/desktop/main/tracker/interview-sync-mapping.js";
import { noteWritePayload } from "../src/desktop/main/tracker/note-sync-mapping.js";
import { reminderWritePayload } from "../src/desktop/main/tracker/reminder-sync-mapping.js";

test("Tracker 子实体 write payload 与后端严格契约一致", () => {
  const interview = interviewWritePayload("app", {
    roundNumber: 2, interviewType: "technical", scheduledAt: "2026-07-30T02:00:00.000Z",
    timezone: "Asia/Hong_Kong", durationMinutes: 60, locationOrLink: "https://meet.test",
    interviewer: "Lin", status: "scheduled",
  });
  assert.deepEqual(Object.keys(interview).sort(), [
    "applicationId", "durationMinutes", "interviewType", "interviewer", "locationOrLink",
    "roundNumber", "scheduledAt", "status", "timezone",
  ]);
  assert.deepEqual(Object.keys(noteWritePayload("app", {
    noteType: "follow_up", content: "  明天跟进  ", interviewRoundId: null,
  })).sort(), ["applicationId", "content", "interviewRoundId", "noteType"]);
  assert.deepEqual(Object.keys(reminderWritePayload("app", {
    title: "面试前准备", remindAt: "2026-07-30T01:00:00.000Z", status: "scheduled",
  })).sort(), ["applicationId", "deliveredAt", "interviewRoundId", "remindAt", "status", "title"]);
});

test("Tracker 投影严格拒绝非法 enum", () => {
  assert.throws(() => toInterview({
    entityType: "interview_round", entityId: "i", entityVersion: 1, localVersion: 1,
    syncStatus: "clean", operation: "upsert", changedAt: "2026-07-29T00:00:00.000Z",
    payload: { id: "i", applicationId: "a", roundNumber: 1, interviewType: "magic",
      scheduledAt: null, timezone: "Asia/Hong_Kong", durationMinutes: null,
      locationOrLink: null, interviewer: null, status: "scheduled",
      createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "2026-07-29T00:00:00.000Z" },
  }), /interviewType/);
});

