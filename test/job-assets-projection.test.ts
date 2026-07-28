import assert from "node:assert/strict";
import test from "node:test";

import { projectJobAssets } from "../src/job-assets/projection.js";
import type {
  JobAssetApplication,
  JobAssetJd,
  JobAssetResume,
} from "../src/job-assets/types.js";

test("one JD owns many targeted resumes while generic use stays independent", () => {
  const result = projectJobAssets({
    jds: [jd("jd-a"), jd("jd-b")],
    resumes: [
      resume("resume-a1", "jd-a"),
      resume("resume-a2", "jd-a", "archived"),
      resume("resume-generic", null),
    ],
    applications: [
      application("app-a1", "jd-a", "resume-a1", "applied"),
      application("app-a2", "jd-a", "resume-a2", "screening"),
      application("app-generic", "jd-b", "resume-generic", "interviewing"),
    ],
  });

  assert.equal(result.jds[0]?.resumeCount, 2);
  assert.deepEqual(
    result.jds[0]?.resumes.map((item) => item.resume.id),
    ["resume-a1", "resume-a2"],
  );
  assert.equal(result.jds[0]?.applicationSummary.total, 2);
  assert.equal(result.jds[1]?.resumeCount, 0);
  assert.equal(result.jds[1]?.applicationSummary.total, 1);
  assert.deepEqual(
    result.genericResumes.map((item) => item.resume.id),
    ["resume-generic"],
  );
  assert.equal(result.genericResumes[0]?.applicationSummary.total, 1);
});

test("Application facts do not infer or rewrite a mismatched Resume binding", () => {
  const result = projectJobAssets({
    jds: [jd("jd-a"), jd("jd-b")],
    resumes: [resume("resume-b", "jd-b")],
    applications: [application("app-a", "jd-a", "resume-b", "offer")],
  });

  assert.equal(result.jds[0]?.resumeCount, 0);
  assert.equal(result.jds[0]?.applicationSummary.total, 1);
  assert.equal(result.jds[1]?.resumeCount, 1);
  assert.equal(result.jds[1]?.applicationSummary.total, 0);
  assert.equal(result.jds[1]?.resumes[0]?.applicationSummary.total, 1);
});

test("empty and deleted references remain explicit without cascading", () => {
  const result = projectJobAssets({
    jds: [jd("jd-live"), jd("jd-deleted", "2026-07-28T00:00:00.000Z")],
    resumes: [
      resume("resume-deleted", "jd-live", "active", "2026-07-28T00:00:00.000Z"),
      resume("resume-orphan", "jd-deleted"),
    ],
    applications: [
      application("app-empty", null, null, "applied"),
      application("app-missing", "jd-deleted", "resume-deleted", "rejected"),
      application("app-live", "jd-live", "resume-deleted", "screening"),
      application("app-deleted", "jd-live", null, "offer", "2026-07-29T00:00:00.000Z"),
    ],
  });

  assert.deepEqual(result.jds.map((item) => item.jd.id), ["jd-live"]);
  assert.equal(result.jds[0]?.resumeCount, 0);
  assert.equal(result.jds[0]?.applicationSummary.total, 1);
  assert.deepEqual(
    result.resumesWithMissingJd.map((item) => item.resume.id),
    ["resume-orphan"],
  );
  assert.deepEqual(
    result.applicationRelations.map(({ application, jd, resume: resumeRef }) => ({
      id: application.id,
      jd: jd.state,
      resume: resumeRef.state,
    })),
    [
      { id: "app-empty", jd: "empty", resume: "empty" },
      { id: "app-missing", jd: "missing", resume: "missing" },
      { id: "app-live", jd: "linked", resume: "missing" },
    ],
  );
});

test("renamed or missing assets never replace frozen Application titles", () => {
  const result = projectJobAssets({
    jds: [{ ...jd("jd-a"), title: "Renamed JD" }],
    resumes: [{ ...resume("resume-a", "jd-a"), title: "Renamed Resume" }],
    applications: [application("app-a", "jd-a", "resume-a", "applied")],
  });
  const relation = result.applicationRelations[0];

  assert.equal(relation?.jd.titleSnapshot, "Original JD");
  assert.equal(relation?.resume.titleSnapshot, "Original Resume");
  assert.equal(relation?.jd.state, "linked");
  assert.equal(relation?.resume.state, "linked");
});

function jd(id: string, deletedAt: string | null = null): JobAssetJd {
  return { id, title: `JD ${id}`, company: null, targetRole: null, deletedAt };
}

function resume(
  id: string,
  jdId: string | null,
  status: JobAssetResume["status"] = "active",
  deletedAt: string | null = null,
): JobAssetResume {
  return { id, title: `Resume ${id}`, jdId, status, deletedAt };
}

function application(
  id: string,
  jdId: string | null,
  resumeId: string | null,
  status: JobAssetApplication["status"],
  deletedAt: string | null = null,
): JobAssetApplication {
  return {
    id,
    jdId,
    resumeId,
    jdTitleSnapshot: "Original JD",
    resumeTitleSnapshot: "Original Resume",
    status,
    appliedAt: "2026-07-28T08:00:00.000Z",
    createdAt: "2026-07-28T08:00:00.000Z",
    deletedAt,
  };
}
