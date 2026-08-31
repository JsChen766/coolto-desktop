import assert from "node:assert/strict";
import test from "node:test";

import type { CalendarAdapter } from "../src/calendar/calendar-adapter.js";
import type { CalendarLink } from "../src/calendar/calendar-types.js";
import { CalendarSyncService } from
  "../src/desktop/main/calendar/calendar-sync-service.js";

test("Calendar service creates once and persists the exact native identity", async () => {
  const fixture = service("write_only");
  assert.equal((await fixture.service.syncInterview("app-1", "interview-1")).outcome,
    "created");
  assert.equal(fixture.created, 1);
  assert.equal(fixture.links.get("interview-1")?.eventIdentifier, "event-1");
  assert.equal((await fixture.service.syncInterview("app-1", "interview-1")).outcome,
    "unchanged");
  assert.equal(fixture.created, 1);
});

test("Calendar service never prompts implicitly and full access updates the same event", async () => {
  const fixture = service("write_only");
  await fixture.service.syncInterview("app-1", "interview-1");
  fixture.interview.scheduledAt = "2026-09-02T04:00:00.000Z";
  const permission = await fixture.service.syncInterview("app-1", "interview-1");
  assert.deepEqual(permission.requiredAccess, "full_access");
  fixture.authorization = "full_access";
  assert.equal((await fixture.service.syncInterview("app-1", "interview-1")).outcome,
    "updated");
  assert.equal(fixture.updated, 1);
});

function service(initial: "write_only" | "full_access") {
  const links = new Map<string, CalendarLink>();
  const interview = {
    id: "interview-1", applicationId: "app-1", roundNumber: 1,
    interviewType: "video", scheduledAt: "2026-09-02T02:00:00.000Z",
    timezone: "Asia/Hong_Kong", durationMinutes: 60,
    locationOrLink: "https://meet.example/interview", status: "scheduled",
  };
  let authorization = initial;
  let created = 0;
  let updated = 0;
  const adapter: CalendarAdapter = {
    authorizationStatus: async () => authorization,
    requestAccess: async (level) => { authorization = level; return authorization; },
    createEvent: async () => ({ eventIdentifier: `event-${++created}`,
      calendarIdentifier: "calendar-1" }),
    updateEvent: async (eventIdentifier) => { updated += 1; return {
      eventIdentifier, calendarIdentifier: "calendar-1",
    }; },
    cancelEvent: async () => undefined,
    openSystemSettings: async () => undefined,
  };
  const service = new CalendarSyncService(
    adapter,
    { get: async (id) => links.get(id) ?? null,
      upsert: async (link) => { links.set(link.interviewId, link); },
      remove: async (id) => { links.delete(id); },
      clearAll: async () => { links.clear(); } },
    { get: async () => ({ id: "app-1", companyName: "Coolto",
      roleName: "Engineer" }) } as never,
    { get: async () => interview } as never,
    { list: async () => [] } as never,
  );
  return {
    service, links, interview,
    get authorization() { return authorization; },
    set authorization(value) { authorization = value; },
    get created() { return created; },
    get updated() { return updated; },
  };
}
