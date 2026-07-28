import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_BOARD_COLUMNS,
  applicationStage,
  applicationStageIndex,
  applicationsInColumn,
} from "../src/desktop/renderer/src/tracker/application-board.js";
import {
  buildApplicationCalendar,
  initialCalendarAnchor,
  shiftCalendarMonth,
} from "../src/desktop/renderer/src/tracker/application-calendar.js";
import {
  applicationFormOf,
  emptyApplicationForm,
  toCreateInput,
  toUpdateInput,
} from "../src/desktop/renderer/src/tracker/application-form.js";
import type { ApplicationRecord } from "../src/tracker/types.js";

test("A1 board keeps three terminal statuses in one exact result column", () => {
  const result = APPLICATION_BOARD_COLUMNS.find((column) => column.key === "result");
  assert.deepEqual(result?.statuses, ["offer", "rejected", "no_response"]);
  assert.deepEqual(
    applicationsInColumn(
      [record("offer"), record("rejected"), record("interviewing")],
      result?.statuses ?? [],
    ).map((item) => item.status),
    ["offer", "rejected"],
  );
});

test("A2 maps exact statuses to four visual stages without flattening result", () => {
  assert.deepEqual(
    ["applied", "screening", "interviewing", "offer", "rejected", "no_response"]
      .map((status) => applicationStage(status as ApplicationRecord["status"])),
    ["applied", "screening", "interviewing", "result", "result", "result"],
  );
  assert.equal(applicationStageIndex("offer"), 3);
});

test("A2 calendar uses real applied dates in a stable six-week grid", () => {
  const application = record("screening");
  application.appliedAt = "2026-07-15T08:00:00.000Z";
  const calendar = buildApplicationCalendar(
    new Date(2026, 6, 1),
    [application],
    new Date(2026, 6, 28),
  );
  assert.equal(calendar.days.length, 42);
  assert.equal(calendar.days.find((day) => day.dateKey === "2026-07-15")?.applications[0]?.id, application.id);
  assert.equal(calendar.days.find((day) => day.dateKey === "2026-07-28")?.isToday, true);
});

test("A2 calendar opens on the nearest useful month and shifts without date drift", () => {
  const application = record("applied");
  application.appliedAt = "2026-05-03T08:00:00.000Z";
  const anchor = initialCalendarAnchor([application], new Date(2026, 6, 28));
  assert.equal(anchor.getMonth(), 4);
  assert.equal(shiftCalendarMonth(anchor, 2).getMonth(), 6);
});

test("manual create form emits an applied-at record without UI-only fields", () => {
  const form = emptyApplicationForm();
  form.companyName = " Coolto ";
  form.roleName = " Engineer ";
  form.jdId = "jd-1";
  const input = toCreateInput(form);
  assert.equal(input.companyName, "Coolto");
  assert.equal(input.roleName, "Engineer");
  assert.equal(input.jdId, "jd-1");
  assert.equal(input.pendingConfirmation, false);
  assert.equal(input.source, "manual");
  assert.ok(input.appliedAt);
});

test("detail editor preserves references and never includes status in update", () => {
  const current = record("screening");
  const input = toUpdateInput(applicationFormOf(current));
  assert.equal(input.jdId, current.jdId);
  assert.equal(input.resumeId, current.resumeId);
  assert.equal("status" in input, false);
});

function record(status: ApplicationRecord["status"]): ApplicationRecord {
  const now = "2026-07-28T08:00:00.000Z";
  return {
    id: `app-${status}`,
    jdId: "jd-1",
    resumeId: "resume-1",
    companyName: "Coolto",
    roleName: "Engineer",
    jdTitleSnapshot: "JD",
    resumeTitleSnapshot: "Resume",
    deliveryMethod: "manual",
    targetUrl: null,
    appliedAt: now,
    status,
    pendingConfirmation: false,
    source: "manual",
    dedupeKey: null,
    companyBusiness: null,
    roleSummary: null,
    companyCulture: null,
    rejectionReason: null,
    entityVersion: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncStatus: "clean",
  };
}
