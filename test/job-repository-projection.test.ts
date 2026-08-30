import assert from "node:assert/strict";
import test from "node:test";

import { projectJobRepository } from "../src/job-assets/repository-projection.js";
import {
  localRepositoryResume,
  repositoryApplication,
  repositoryJd,
  repositoryResume,
} from "./support/job-repository-fixture.js";

test("keeps the primary JD separate from every actually submitted JD", () => {
  const snapshot = projectJobRepository({
    jds: [repositoryJd("a"), repositoryJd("b")],
    resumes: [repositoryResume("resume-a", "a")],
    applications: [
      repositoryApplication("app-a", "a", "resume-a", "applied"),
      repositoryApplication("app-b", "b", "resume-a", "interviewing"),
    ],
  });
  const resume = snapshot.resumes[0];

  assert.equal(resume?.primaryJd.id, "a");
  assert.deepEqual(
    resume?.appliedJds.map((jd) => jd.id).sort(),
    ["a", "b"],
  );
  assert.equal(snapshot.jds[0]?.targetedResumeIds[0], "resume-a");
  assert.deepEqual(snapshot.jds[1]?.targetedResumeIds, []);
  assert.equal(snapshot.jds[1]?.otherUsedResumes[0]?.id, "resume-a");
});

test("a generic Resume stays generic after it is used for a JD", () => {
  const snapshot = projectJobRepository({
    jds: [repositoryJd("a")],
    resumes: [repositoryResume("generic", null)],
    applications: [repositoryApplication("app", "a", "generic")],
  });

  assert.equal(snapshot.resumes[0]?.kind, "generic");
  assert.equal(snapshot.resumes[0]?.primaryJd.state, "empty");
  assert.deepEqual(snapshot.jds[0]?.targetedResumeIds, []);
  assert.equal(snapshot.jds[0]?.otherUsedResumes[0]?.id, "generic");
});

test("keeps local-only and archived Resume entries visible", () => {
  const snapshot = projectJobRepository({
    jds: [],
    resumes: [
      localRepositoryResume("draft"),
      repositoryResume("archived", null, { status: "archived" }),
    ],
    applications: [],
  });

  assert.equal(snapshot.resumes[0]?.kind, "local_only");
  assert.equal(snapshot.resumes[1]?.entry.cloud?.status, "archived");
  assert.equal(snapshot.resumes[0]?.applicationSummary.total, 0);
});

test("links a local tailored draft to its source JD before cloud save", () => {
  const snapshot = projectJobRepository({
    jds: [repositoryJd("a")],
    resumes: [localRepositoryResume("draft-a", "a")],
    applications: [],
  });

  assert.equal(snapshot.resumes[0]?.kind, "targeted");
  assert.equal(snapshot.resumes[0]?.primaryJd.id, "a");
  assert.deepEqual(snapshot.jds[0]?.targetedResumeIds, []);
  assert.deepEqual(snapshot.jds[0]?.targetedResumeEntryIds, ["local:draft-a"]);
});

test("keeps a local general draft independent from every JD", () => {
  const snapshot = projectJobRepository({
    jds: [repositoryJd("a")],
    resumes: [localRepositoryResume("general", null, "general")],
    applications: [],
  });

  assert.equal(snapshot.resumes[0]?.kind, "generic");
  assert.equal(snapshot.resumes[0]?.primaryJd.state, "empty");
  assert.deepEqual(snapshot.jds[0]?.targetedResumeEntryIds, []);
});

test("missing references retain the frozen Application title", () => {
  const snapshot = projectJobRepository({
    jds: [repositoryJd("a")],
    resumes: [],
    applications: [
      repositoryApplication("app", "a", "gone", "rejected", {
        resume: "Frozen missing Resume",
      }),
    ],
  });

  assert.deepEqual(snapshot.jds[0]?.otherUsedResumes[0], {
    id: "gone",
    title: "Frozen missing Resume",
    state: "missing",
  });
  assert.equal(snapshot.jds[0]?.applicationSummary.statusCounts.rejected, 1);
});

test("user source delivery files stay independent and available without a JD relation", () => {
  const deliveryFile = {
    id: "00000000-0000-4000-8000-000000000001",
    title: "原始投递简历",
    originalFilename: "resume.pdf",
    type: "pdf" as const,
    mimeType: "application/pdf",
    sizeBytes: 100,
    sha256: "b".repeat(64),
    preferred: true,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
  const snapshot = projectJobRepository({
    jds: [repositoryJd("a"), repositoryJd("b")],
    resumes: [repositoryResume("managed", "a")],
    applications: [],
    deliveryResumeFiles: [deliveryFile],
  });

  assert.deepEqual(snapshot.deliveryResumeFiles, [deliveryFile]);
  assert.equal(snapshot.resumes.length, 1);
  assert.deepEqual(snapshot.jds.map((jd) => jd.targetedResumeIds), [
    ["managed"],
    [],
  ]);
});
