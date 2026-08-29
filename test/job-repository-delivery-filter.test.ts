import assert from "node:assert/strict";
import test from "node:test";

import type { DeliveryResumeFile } from
  "../src/delivery-resume-files/types.js";
import { filterDeliveryResumeFiles } from
  "../src/desktop/renderer/src/job-assets/job-repository-filter.js";
import { filterResumes } from
  "../src/desktop/renderer/src/job-assets/job-repository-filter.js";
import { localRepositoryResume } from "./support/job-repository-fixture.js";
import { projectJobRepository } from "../src/job-assets/repository-projection.js";

const file: DeliveryResumeFile = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "全岗位投递文件",
  originalFilename: "resume.pdf",
  type: "pdf",
  mimeType: "application/pdf",
  sizeBytes: 100,
  sha256: "a".repeat(64),
  preferred: true,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
};

test("user source files are never filtered by JD relevance", () => {
  assert.deepEqual(filterDeliveryResumeFiles([file], "", ""), [file]);
  assert.deepEqual(filterDeliveryResumeFiles([file], "全岗位", "user_original"), [file]);
  assert.deepEqual(filterDeliveryResumeFiles([file], "", "local_only"), [file]);
  assert.deepEqual(filterDeliveryResumeFiles([file], "", "targeted"), []);
  assert.deepEqual(filterDeliveryResumeFiles([file], "不匹配的岗位", ""), []);
  const managed = projectJobRepository({
    jds: [],
    resumes: [localRepositoryResume("draft")],
    applications: [],
  }).resumes;
  assert.deepEqual(filterResumes(managed, "", "user_original"), []);
});
