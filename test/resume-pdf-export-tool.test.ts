import assert from "node:assert/strict";
import test from "node:test";

import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";
import { ResumePdfExportProposalBuilder } from "../src/resume/export/proposal-builder.js";
import { ResumePdfExportSourceResolver } from "../src/resume/export/source-resolver.js";
import { createToolRegistry } from "../src/tools/registry.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";
import { FixtureResumeCompiler } from "./support/resume-workspace-fixture.js";

test("PDF prepare tool creates approval without invoking the export gateway", async () => {
  const { store, ready } = await createReadySaveFixture();
  let exportCalls = 0;
  const approvals = createActionApprovalManager(
    { createExperience: async () => { throw new Error("not used"); } },
    new ExperienceImportProposalStore(),
    undefined,
    {
      exportPdf: async () => {
        exportCalls += 1;
        return { status: "cancelled" as const };
      },
    },
  );
  const builder = new ResumePdfExportProposalBuilder(
    new ResumePdfExportSourceResolver(store, {} as never),
    new FixtureResumeCompiler(),
  );
  const tools = createToolRegistry({
    resumePdfExportProposalBuilder: builder,
    approvalManager: approvals,
  });
  const tool = tools.find((candidate) => candidate.name === "prepare_resume_pdf_export");
  assert.ok(tool);

  await tool.execute("pdf-tool", {
    source: "candidate",
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "产品经理简历",
  });

  assert.equal(exportCalls, 0);
  assert.equal(approvals.listPending().length, 1);
});
