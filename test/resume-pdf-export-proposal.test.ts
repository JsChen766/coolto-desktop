import assert from "node:assert/strict";
import test from "node:test";

import type { ResumePublicationGateway } from "../src/resume/save/types.js";
import { ResumePdfExportProposalBuilder } from "../src/resume/export/proposal-builder.js";
import { ResumePdfExportSourceResolver } from "../src/resume/export/source-resolver.js";
import type { ResumeFull } from "../src/resume/types.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";
import { FixtureResumeCompiler } from "./support/resume-workspace-fixture.js";
import { cloudResumeFixture } from "./support/cloud-resume-fixture.js";

test("ready candidate becomes an isolated and freshly compiled PDF proposal", async () => {
  const { store, ready } = await createReadySaveFixture();
  const builder = new ResumePdfExportProposalBuilder(
    new ResumePdfExportSourceResolver(store, unusedReader()),
    new FixtureResumeCompiler(),
    { createProposalId: () => "pdf-proposal-1" },
  );
  const payload = await builder.build({
    source: "candidate",
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "产品经理 / 终稿",
  });

  assert.equal(payload.proposalId, "pdf-proposal-1");
  assert.equal(payload.suggestedFilename, "产品经理 - 终稿.pdf");
  assert.equal(payload.compileResult.qualified, true);
  assert.match(payload.structureHash, /^[a-f0-9]{64}$/u);
  ready.structure.sections[0]!.heading = "mutated";
  assert.notEqual(payload.structure.sections[0]!.heading, "mutated");
});

test("published PDF source resolves the one passed cloud document", async () => {
  const { store, ready } = await createReadySaveFixture();
  const resume = cloudResumeFixture(ready.structure);
  const builder = new ResumePdfExportProposalBuilder(
    new ResumePdfExportSourceResolver(store, readerFor(resume)),
    new FixtureResumeCompiler(),
  );
  const payload = await builder.build({ source: "published", resumeId: resume.id });
  assert.equal(payload.resumeId, resume.id);
  assert.equal(payload.contentHash, resume.contentHash);

  resume.qualityStatus = "failed";
  await assert.rejects(
    builder.build({ source: "published", resumeId: resume.id }),
    /quality-passed/u,
  );
});

function readerFor(resume: ResumeFull): ResumePublicationGateway {
  return { ...unusedReader(), listResumes: async () => [resume], getResume: async () => resume };
}

function unusedReader(): ResumePublicationGateway {
  const unused = async () => { throw new Error("not used"); };
  return {
    listResumes: unused,
    getResume: unused,
    publishNew: unused,
    publishExisting: unused,
  };
}
