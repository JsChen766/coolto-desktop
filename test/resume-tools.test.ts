import assert from "node:assert/strict";
import test from "node:test";

import type { ResumePublicationGateway } from "../src/resume/save/types.js";
import { createResumeReadTools } from "../src/tools/resume-tools.js";
import { cloudResumeFixture } from "./support/cloud-resume-fixture.js";

test("resume read tools expose one current cloud document and its content hash", async () => {
  const reader = readerFixture();
  const [listTool, getTool] = createResumeReadTools(reader);

  const listed = await listTool!.execute("list", {});
  assert.deepEqual(listed.details, [{
    id: "resume-1",
    title: "产品经理简历",
    targetRole: "产品经理",
    jdId: "jd-1",
    contentHash: "content-hash-1",
    qualityStatus: "passed",
    updatedAt: "2026-07-24T00:00:00Z",
  }]);

  const detail = await getTool!.execute("get", { resumeId: "resume-1" });
  assert.deepEqual(detail.details, {
    id: "resume-1",
    title: "产品经理简历",
    targetRole: "产品经理",
    jdId: "jd-1",
    contentHash: "content-hash-1",
    schemaVersion: "resume-structure.v1",
    qualityStatus: "passed",
    status: "published",
    updatedAt: "2026-07-24T00:00:00Z",
    structured: {
      language: "zh-CN",
      contact: null,
      sections: [],
    },
  });
});

function readerFixture(): ResumePublicationGateway {
  const resume = cloudResumeFixture();
  const unused = async () => { throw new Error("not used"); };
  return {
    listResumes: async () => [resume],
    getResume: async () => resume,
    publishNew: unused,
    publishExisting: unused,
  };
}
