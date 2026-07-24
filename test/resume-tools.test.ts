import assert from "node:assert/strict";
import test from "node:test";

import type { ResumePublicationGateway } from "../src/resume/save/types.js";
import type { ResumeFull } from "../src/resume/types.js";
import { createResumeReadTools } from "../src/tools/resume-tools.js";

test("resume read tools expose only target and published version metadata", async () => {
  const reader = readerFixture();
  const [listTool, getTool] = createResumeReadTools(reader);

  const listed = await listTool!.execute("list", {});
  assert.deepEqual(listed.details, [{
    id: "resume-1",
    title: "产品经理简历",
    targetRole: "产品经理",
    jdId: "jd-1",
    activeVariantId: "variant-1",
    updatedAt: "2026-07-24T00:00:00Z",
  }]);

  const detail = await getTool!.execute("get", { resumeId: "resume-1" });
  assert.equal(JSON.stringify(detail).includes("private structured content"), false);
  assert.deepEqual(detail.details.variants, [{
    id: "variant-1",
    title: "产品经理简历",
    version: 1,
    gateStatus: "passed",
    publicationStatus: "published",
    createdAt: "2026-07-24T00:00:00Z",
  }]);
});

function readerFixture(): ResumePublicationGateway {
  const resume = resumeFixture();
  const unused = async () => { throw new Error("not used"); };
  return {
    listResumes: async () => [resume],
    getResume: async () => resume,
    stageNew: unused,
    stageVariant: unused,
    verify: unused,
    accept: unused,
    reject: unused,
  };
}

function resumeFixture(): ResumeFull {
  return {
    id: "resume-1",
    title: "产品经理简历",
    targetRole: "产品经理",
    jdId: "jd-1",
    activeVariantId: "variant-1",
    status: "active",
    createdAt: "2026-07-24T00:00:00Z",
    updatedAt: "2026-07-24T00:00:00Z",
    items: [],
    variants: [{
      id: "variant-1",
      title: "产品经理简历",
      content: "private structured content",
      structured: null,
      parentVariantId: null,
      version: 1,
      score: {
        overall: 1,
        relevance: 1,
        clarity: 1,
        evidenceStrength: 1,
        quantifiedImpact: 1,
      },
      evidenceSummary: [],
      riskSummary: [],
      missingInfo: [],
      gateStatus: "passed",
      publicationStatus: "published",
      createdAt: "2026-07-24T00:00:00Z",
    }],
  };
}
