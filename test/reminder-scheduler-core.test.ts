import assert from "node:assert/strict";
import test from "node:test";

import type { Reminder } from "../src/tracker/child-types.js";
import {
  ReminderSchedulerCore,
  type ReminderNotificationPort,
} from "../src/desktop/main/tracker/reminder-scheduler-core.js";

const NOW = new Date("2026-07-29T16:00:00.000Z");

test("提醒 show 后写本地凭据与 delivered Outbox，并在同一版本只执行一次", async () => {
  const reminder = record("2026-07-29T15:59:00.000Z");
  const receipts = new Set<string>();
  const delivered: string[] = [];
  const notification = fakeNotification("show");
  const window = fakeWindow();
  const core = new ReminderSchedulerCore(
    { list: async () => [reminder], markDelivered: async (id) => {
      delivered.push(id); return { ...reminder, status: "delivered" };
    } },
    ledger(receipts), window,
    () => notification.port,
    () => NOW,
  );

  await core.scan();
  await core.scan();
  assert.equal(notification.shows, 1);
  assert.deepEqual(delivered, [reminder.id]);
  assert(receipts.has(`${reminder.id}\0${reminder.remindAt}`));
  notification.emit("click");
  assert.deepEqual(window.actions, ["restore", "show", "focus"]);
});

test("通知 failed 不写送达凭据，并允许下一轮重试", async () => {
  const reminder = record("2026-07-29T15:59:00.000Z");
  const receipts = new Set<string>();
  let notifications = 0;
  const core = new ReminderSchedulerCore(
    { list: async () => [reminder], markDelivered: async () => reminder },
    ledger(receipts), fakeWindow(),
    () => { notifications += 1; return fakeNotification("failed").port; },
    () => NOW,
  );
  await core.scan();
  await core.scan();
  assert.equal(notifications, 2);
  assert.equal(receipts.size, 0);
});

test("超过 24 小时与父记录删除的提醒不创建系统通知", async () => {
  const old = record("2026-07-28T15:59:59.000Z");
  let notifications = 0;
  const deletedLedger = ledger(new Set(), "delete");
  const core = new ReminderSchedulerCore(
    { list: async () => [old], markDelivered: async () => old },
    deletedLedger, fakeWindow(),
    () => { notifications += 1; return fakeNotification("show").port; },
    () => NOW,
  );
  await core.scan();
  assert.equal(notifications, 0);
});

function record(remindAt: string): Reminder {
  return {
    id: "reminder", applicationId: "application", interviewRoundId: null,
    title: "Follow up", remindAt, status: "scheduled", deliveredAt: null,
    entityVersion: 1, createdAt: remindAt, updatedAt: remindAt,
    deletedAt: null, syncStatus: "clean",
  };
}

function ledger(receipts: Set<string>, operation: "upsert" | "delete" = "upsert") {
  return {
    getEntity: () => ({ operation }),
    hasReminderDelivery: (id: string, remindAt: string) => receipts.has(`${id}\0${remindAt}`),
    recordReminderDelivery: (id: string, remindAt: string) => receipts.add(`${id}\0${remindAt}`),
  };
}

function fakeWindow() {
  const actions: string[] = [];
  return {
    actions, isMinimized: () => true,
    restore: () => { actions.push("restore"); },
    show: () => { actions.push("show"); },
    focus: () => { actions.push("focus"); },
  };
}

function fakeNotification(result: "show" | "failed") {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const state = { shows: 0 };
  const port = {
    once(event: string, listener: (...args: unknown[]) => void) {
      listeners.set(event, listener); return port;
    },
    show() {
      state.shows += 1;
      if (result === "show") listeners.get("show")?.();
      else listeners.get("failed")?.(undefined, "not available");
    },
  } as ReminderNotificationPort;
  return {
    port,
    get shows() { return state.shows; },
    emit: (event: "click") => listeners.get(event)?.(),
  };
}
