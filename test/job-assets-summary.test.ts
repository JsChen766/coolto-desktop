import assert from "node:assert/strict";
import test from "node:test";

import { summarizeApplications } from "../src/job-assets/application-summary.js";
import type { JobAssetApplication } from "../src/job-assets/types.js";
import type { ApplicationStatus } from "../src/tracker/types.js";

test("application summary keeps six exact statuses without a second status", () => {
  const applications = [
    application("applied", "2026-07-20T08:00:00.000Z"),
    application("screening", "2026-07-21T08:00:00.000Z"),
    application("interviewing", "2026-07-22T08:00:00.000Z"),
    application("offer", "2026-07-23T08:00:00.000Z"),
    application("rejected", "2026-07-24T08:00:00.000Z"),
    application("no_response", "2026-07-25T08:00:00.000Z"),
    application("screening", "2026-07-26T08:00:00.000Z"),
  ];

  assert.deepEqual(summarizeApplications(applications), {
    total: 7,
    statusCounts: {
      applied: 1,
      screening: 2,
      interviewing: 1,
      offer: 1,
      rejected: 1,
      no_response: 1,
    },
    latest: {
      id: "app-screening-2026-07-26T08:00:00.000Z",
      status: "screening",
      occurredAt: "2026-07-26T08:00:00.000Z",
    },
  });
});

test("latest application falls back to createdAt and resolves ties by id", () => {
  const first = application("applied", null, "app-a");
  const second = application("offer", null, "app-b");

  assert.deepEqual(summarizeApplications([second, first]).latest, {
    id: "app-b",
    status: "offer",
    occurredAt: first.createdAt,
  });
});

function application(
  status: ApplicationStatus,
  appliedAt: string | null,
  id = `app-${status}-${appliedAt}`,
): JobAssetApplication {
  return {
    id,
    jdId: "jd-1",
    resumeId: "resume-1",
    jdTitleSnapshot: "Original JD",
    resumeTitleSnapshot: "Original Resume",
    status,
    appliedAt,
    createdAt: "2026-07-19T08:00:00.000Z",
    deletedAt: null,
  };
}
