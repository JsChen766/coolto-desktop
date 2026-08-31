import assert from "node:assert/strict";
import test from "node:test";

import { parseCalendarDeepLink } from
  "../src/desktop/main/calendar/calendar-deep-link-router.js";

test("Calendar deep link selects one exact Application and Interview", () => {
  assert.deepEqual(parseCalendarDeepLink(
    "coolto://tracker/application/app-1?interview=interview-2",
  ), { applicationId: "app-1", interviewId: "interview-2" });
});

test("Calendar deep link rejects foreign routes and missing ids", () => {
  for (const value of [
    "https://tracker/application/app-1?interview=interview-2",
    "coolto://browser/application/app-1?interview=interview-2",
    "coolto://tracker/application/app-1",
    "coolto://tracker/application/app-1/extra?interview=interview-2",
  ]) assert.equal(parseCalendarDeepLink(value), null);
});
