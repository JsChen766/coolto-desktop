import assert from "node:assert/strict";
import test from "node:test";

import type { ResumePublicationGateway } from "../src/resume/save/types.js";
import { createResumeReadTools } from "../src/tools/resume-tools.js";
import { cloudResumeFixture } from "./support/cloud-resume-fixture.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";
import type { LocalResumeDraft } from "../src/resume/draft/types.js";

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

test("list_resumes exposes a ready local general resume before cloud save", async () => {
  const { ready } = await createReadySaveFixture();
  ready.sourceSnapshot = {
    ...ready.sourceSnapshot,
    generationStrategy: "general",
    jd: null,
  };
  const draft: LocalResumeDraft = {
    schemaVersion: "local-resume-draft-v1",
    artifactId: "general-draft",
    ownerId: "user-1",
    conversationIds: ["conversation-1"],
    title: "通用简历",
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    workspace: ready,
    checkpoints: [],
    pendingChange: null,
    cloudLink: null,
  };
  const [listTool] = createResumeReadTools(readerFixture(), undefined, {
    listReusableDrafts: async () => [draft],
    getReusableDraft: async () => draft,
  });

  const listed = await listTool!.execute("list", {});

  assert.ok(Array.isArray(listed.details));
  assert.ok((listed.details as Array<Record<string, unknown>>).some((item) =>
    item.source === "local" && item.artifactId === "general-draft" &&
    item.jdId === null
  ));
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
