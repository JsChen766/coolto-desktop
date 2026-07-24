import assert from "node:assert/strict";
import test from "node:test";

import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import { createResumePdfExportApprovalDraft } from "../src/resume/export/approval-draft.js";
import { ResumePdfExportProposalBuilder } from "../src/resume/export/proposal-builder.js";
import { ResumePdfExportSourceResolver } from "../src/resume/export/source-resolver.js";
import type { ResumePdfExportGateway } from "../src/resume/export/types.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";
import { FixtureResumeCompiler } from "./support/resume-workspace-fixture.js";

test("PDF export has no host side effect before accept or after reject", async () => {
  const payload = await proposal();
  const gateway = new RecordingExportGateway();
  const approvals = manager(gateway);
  const request = await approvals.request(
    createResumePdfExportApprovalDraft(payload), payload,
  );
  assert.equal(gateway.calls, 0);
  await approvals.resolve(request.id, { type: "reject" });
  assert.equal(gateway.calls, 0);
});

test("accepted PDF approval calls the host exporter exactly once", async () => {
  const payload = await proposal();
  const gateway = new RecordingExportGateway();
  const approvals = manager(gateway);
  const summaries: string[] = [];
  approvals.subscribe((event) => {
    if (event.type === "approval.completed") summaries.push(event.summary);
  });
  const request = await approvals.request(
    createResumePdfExportApprovalDraft(payload), payload,
  );
  await approvals.resolve(request.id, { type: "accept" });
  assert.equal(gateway.calls, 1);
  assert.deepEqual(summaries, ["PDF 已导出：resume.pdf"]);
});

async function proposal() {
  const { store, ready } = await createReadySaveFixture();
  return new ResumePdfExportProposalBuilder(
    new ResumePdfExportSourceResolver(store, {} as never),
    new FixtureResumeCompiler(),
  ).build({
    source: "candidate", candidateId: ready.candidateId,
    expectedRevision: ready.revision, title: "resume",
  });
}

function manager(gateway: ResumePdfExportGateway) {
  return createActionApprovalManager(
    { createExperience: async () => { throw new Error("not used"); } },
    new ExperienceImportProposalStore(),
    undefined,
    gateway,
  );
}

class RecordingExportGateway implements ResumePdfExportGateway {
  public calls = 0;
  public async exportPdf() {
    this.calls += 1;
    return {
      status: "exported" as const, filePath: "/tmp/resume.pdf", filename: "resume.pdf",
      bytes: 100, sha256: "a".repeat(64), pageCount: 1,
      embeddedFontNames: ["SimSun", "TimesNewRoman"],
    };
  }
}
