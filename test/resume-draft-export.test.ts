import assert from "node:assert/strict";
import test from "node:test";

import { createLocalResumeDraft } from "../src/resume/draft/projection.js";
import type { LocalResumeDraft } from "../src/resume/draft/types.js";
import {
  buildDraftPdfExportPayload,
  isExportableWorkspace,
} from "../src/resume/export/draft-export.js";
import { ResumePdfExportError } from "../src/resume/export/errors.js";
import { resumePdfFilename } from "../src/resume/export/filename.js";
import { sha256, stableStringify } from "../src/resume/stable-snapshot.js";
import type { ResumeWorkspace } from "../src/resume/workspace/types.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import {
  FixtureResumeCompiler,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

test("buildDraftPdfExportPayload returns a frozen payload for a qualified draft", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  const payload = buildDraftPdfExportPayload({
    draft,
    expectedRevision: workspace.revision,
  });

  assert.equal(payload.source, "candidate");
  assert.equal(payload.candidateId, workspace.candidateId);
  assert.equal(payload.candidateRevision, workspace.revision);
  assert.equal(payload.title, draft.title);
  assert.equal(payload.suggestedFilename, resumePdfFilename(draft.title));
  assert.equal(
    payload.structureHash,
    sha256(stableStringify(payload.structure)),
  );

  const firstSection = payload.structure.sections[0];
  const firstItem = firstSection?.items[0];
  assert.ok(firstItem, "fixture structure must have items");
  firstItem.title = "mutated";
  assert.notEqual(
    draft.workspace.structure.sections[0]?.items[0]?.title,
    firstItem.title,
    "payload structure must be a detached clone",
  );
});

test("stale revision is rejected", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  const error = await rejectExport({
    draft,
    expectedRevision: workspace.revision + 1,
  });
  assert.equal(error.code, "stale_candidate_revision");
});

test("unmerged pending change is rejected", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  const pendingDraft: LocalResumeDraft = {
    ...draft,
    pendingChange: {
      id: "pending-1",
      createdAt: "2026-07-25T00:00:00Z",
      summary: "AI 修改简历内容",
      changedBulletIds: [],
      base: structuredClone(workspace),
      proposed: structuredClone(workspace),
    },
  };
  const error = await rejectExport({
    draft: pendingDraft,
    expectedRevision: workspace.revision,
  });
  assert.equal(error.code, "draft_has_pending_change");
});

test("non ready_for_approval status is rejected", async () => {
  const { draft, workspace } = await createQualifiedDraft({
    status: "needs_revision",
  });
  const error = await rejectExport({ draft, expectedRevision: workspace.revision });
  assert.equal(error.code, "candidate_not_exportable");
});

test("missing quality report is rejected", async () => {
  const { draft, workspace } = await createQualifiedDraft({
    withoutQualityReport: true,
  });
  const error = await rejectExport({ draft, expectedRevision: workspace.revision });
  assert.equal(error.code, "candidate_not_exportable");
});

test("unpassed structure quality status is rejected", async () => {
  const { draft, workspace } = await createQualifiedDraft({
    qualityStatus: "failed",
  });
  const error = await rejectExport({ draft, expectedRevision: workspace.revision });
  assert.equal(error.code, "candidate_not_exportable");
});

test("unqualified compile result is rejected", async () => {
  const { draft, workspace } = await createQualifiedDraft({
    compileQualified: false,
  });
  const error = await rejectExport({ draft, expectedRevision: workspace.revision });
  assert.equal(error.code, "candidate_not_exportable");
});

test("isExportableWorkspace gates every failure mode", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  assert.equal(isExportableWorkspace(workspace), true);
  assert.equal(
    isExportableWorkspace({ ...workspace, status: "writing" }),
    false,
  );
  const withoutQualityReport = { ...workspace };
  delete withoutQualityReport.qualityReport;
  assert.equal(isExportableWorkspace(withoutQualityReport), false);
  assert.equal(
    isExportableWorkspace({
      ...workspace,
      structure: {
        ...workspace.structure,
        quality_status: "failed",
      },
    }),
    false,
  );
  assert.equal(
    isExportableWorkspace({
      ...workspace,
      compileResult: { ...workspace.compileResult, qualified: false },
    }),
    false,
  );
});

async function createQualifiedDraft(
  overrides: {
    status?: ResumeWorkspace["status"];
    withoutQualityReport?: boolean;
    qualityStatus?: "passed" | "needs_user_decision" | "failed";
    compileQualified?: boolean;
  } = {},
): Promise<{ draft: LocalResumeDraft; workspace: ResumeWorkspace }> {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "draft-export-test",
  });
  const prepared = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
  });
  const workspace: ResumeWorkspace = structuredClone(prepared);
  workspace.structure.quality_status =
    overrides.qualityStatus ?? "passed";
  workspace.status = overrides.status ?? "ready_for_approval";
  workspace.compileResult = {
    ...workspace.compileResult,
    qualified: overrides.compileQualified ?? true,
  };
  if (!overrides.withoutQualityReport) {
    workspace.qualityReport = {
      passed: true,
      blocking: false,
      issues: [],
      score: {
        overall: 1,
        weightedJdCoverage: 1,
        mustHaveCoverage: 1,
        evidenceSpecificity: 1,
        informationDiversity: 1,
      },
      repairTargets: [],
      frozenBulletIds: [],
    };
  }
  const draft = createLocalResumeDraft({
    ownerId: "user-1",
    conversationId: "c-1",
    artifactId: "draft-1",
    now: "2026-07-25T00:00:00Z",
    workspace,
  });
  return { draft, workspace };
}

async function rejectExport(input: {
  draft: LocalResumeDraft;
  expectedRevision: number;
}): Promise<ResumePdfExportError> {
  try {
    buildDraftPdfExportPayload(input);
  } catch (error) {
    assert.ok(error instanceof ResumePdfExportError);
    return error;
  }
  assert.fail("expected buildDraftPdfExportPayload to reject");
}
