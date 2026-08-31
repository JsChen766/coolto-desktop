import assert from "node:assert/strict";
import test from "node:test";

import {
  CalendarMappingError,
  calendarEventFingerprint,
  interviewCalendarEvent,
} from "../src/calendar/interview-calendar-event.js";
import { planInterviewCalendarSync } from "../src/calendar/calendar-sync-plan.js";
import type { CalendarLink } from "../src/calendar/calendar-types.js";

const application = { id: "app-1", companyName: "Coolto", roleName: "Backend Engineer" };
const interview = {
  id: "interview-1", applicationId: "app-1", roundNumber: 2,
  interviewType: "technical" as const, scheduledAt: "2026-09-02T02:00:00.000Z",
  timezone: "Asia/Hong_Kong", durationMinutes: 60,
  locationOrLink: "https://meet.example/interview", status: "scheduled" as const,
};
const deepLink = "coolto://tracker/application/app-1?interview=interview-1";

test("Interview maps to one minimal event with no JD or Resume payload", () => {
  const event = interviewCalendarEvent({ application, interview, deepLink });
  assert.deepEqual(event, {
    sourceId: "coolto:interview:interview-1",
    title: "Coolto · Backend Engineer · 第 2 轮技术面试",
    startAt: "2026-09-02T02:00:00.000Z", endAt: "2026-09-02T03:00:00.000Z",
    timezone: "Asia/Hong_Kong", location: null,
    meetingUrl: "https://meet.example/interview", notes: deepLink, deepLink,
    alarmOffsetsMinutes: [],
  });
  assert.equal(calendarEventFingerprint(event).length, 64);
  assert.doesNotMatch(JSON.stringify(event), /resume|jdTitle|resumeTitle/iu);
});

test("physical locations stay locations while incomplete facts fail closed", () => {
  const event = interviewCalendarEvent({
    application, interview: { ...interview, locationOrLink: "Central, Hong Kong" }, deepLink,
  });
  assert.equal(event.location, "Central, Hong Kong");
  assert.equal(event.meetingUrl, null);
  assert.throws(() => interviewCalendarEvent({
    application, interview: { ...interview, durationMinutes: null }, deepLink,
  }), (error) => error instanceof CalendarMappingError && error.code === "missing_duration");
  assert.throws(() => interviewCalendarEvent({
    application, interview: { ...interview, timezone: "Mars/Olympus" }, deepLink,
  }), (error) => error instanceof CalendarMappingError && error.code === "invalid_timezone");
});

test("a new event requests write-only once then creates", () => {
  const waiting = plan("not_determined", null);
  assert.equal(waiting.kind, "request_write_only");
  assert.equal(plan("write_only", null).kind, "create");
  assert.equal(plan("full_access", null).kind, "create");
});

test("an unchanged CalendarLink prevents duplicate events", () => {
  const event = interviewCalendarEvent({ application, interview, deepLink });
  const same = { ...link, eventFingerprint: calendarEventFingerprint(event) };
  assert.deepEqual(plan("write_only", same), { kind: "none", reason: "unchanged" });
});

test("reschedule and cancel require full access after creation", () => {
  const rescheduled = { ...interview, scheduledAt: "2026-09-02T04:00:00.000Z" };
  const writeOnly = planInterviewCalendarSync({
    application, interview: rescheduled, deepLink, authorization: "write_only", link,
  });
  assert.equal(writeOnly.kind, "request_full_access");
  assert.equal(writeOnly.kind === "request_full_access" && writeOnly.reason, "update");
  assert.equal(planInterviewCalendarSync({
    application, interview: rescheduled, deepLink, authorization: "full_access", link,
  }).kind, "update");
  assert.equal(planInterviewCalendarSync({
    application, interview: { ...interview, status: "canceled" }, deepLink,
    authorization: "write_only", link,
  }).kind, "request_full_access");
  assert.equal(planInterviewCalendarSync({
    application, interview: { ...interview, status: "canceled" }, deepLink,
    authorization: "full_access", link,
  }).kind, "cancel");
});

test("permission denial degrades without changing Tracker facts", () => {
  assert.deepEqual(plan("denied", null), {
    kind: "blocked", reason: "permission_denied",
    message: "系统日历权限已拒绝，Tracker 记录不受影响",
  });
  assert.equal(plan("unavailable", null).kind, "blocked");
});

test("completed or unlinked canceled interviews need no Calendar mutation", () => {
  assert.deepEqual(planInterviewCalendarSync({
    application, interview: { ...interview, status: "completed" }, deepLink,
    authorization: "full_access", link,
  }), { kind: "none", reason: "not_scheduled" });
  assert.deepEqual(planInterviewCalendarSync({
    application, interview: { ...interview, status: "canceled" }, deepLink,
    authorization: "full_access", link: null,
  }), { kind: "none", reason: "not_linked" });
});

test("a CalendarLink cannot cross application or interview boundaries", () => {
  const result = plan("full_access", { ...link, interviewId: "other" });
  assert.deepEqual(result, {
    kind: "blocked", reason: "invalid_link", message: "Calendar 映射不属于当前面试",
  });
});

const link: CalendarLink = {
  applicationId: "app-1", interviewId: "interview-1",
  eventIdentifier: "event-1", calendarIdentifier: "calendar-1",
  eventFingerprint: "0".repeat(64), createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function plan(
  authorization: Parameters<typeof planInterviewCalendarSync>[0]["authorization"],
  calendarLink: CalendarLink | null,
) {
  return planInterviewCalendarSync({
    application, interview, deepLink, authorization, link: calendarLink,
  });
}
