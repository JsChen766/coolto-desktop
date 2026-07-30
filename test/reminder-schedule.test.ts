import assert from "node:assert/strict";
import test from "node:test";
import { reminderDueState } from "../src/tracker/reminder-schedule.js";

const NOW = new Date("2026-07-29T12:00:00.000Z");

test("提醒按未来、24 小时补发和已错过分组", () => {
  assert.equal(reminderDueState("2026-07-29T12:01:00.000Z", NOW), "future");
  assert.equal(reminderDueState("2026-07-28T12:00:00.000Z", NOW), "due");
  assert.equal(reminderDueState("2026-07-28T11:59:59.999Z", NOW), "missed");
});
