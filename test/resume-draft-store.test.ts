import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ResumeDraftFileRepository } from "../src/desktop/main/resume-drafts/draft-file-repository.js";
import { ResumeDraftEditingService } from "../src/desktop/main/resume-drafts/draft-editing-service.js";
import { toResumeDraftDetail } from "../src/desktop/main/resume-drafts/draft-view.js";
import { ResumeDraftService } from "../src/desktop/main/resume-drafts/resume-draft-service.js";
import type { ResumeDraftCodec } from "../src/resume/draft/types.js";
import { ResumeManualEditor } from "../src/resume/draft/manual-editor.js";
import { applyCandidatePatch } from "../src/resume/workspace/candidate-patch.js";
import { resolveEvidenceBindingInput } from "../src/resume/workspace/evidence-resolution.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { deriveWorkspaceStatus } from "../src/resume/workspace/workspace-status.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import {
  createWorkspaceSnapshotBuilder,
  createBinding,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

const codec: ResumeDraftCodec = {
  encode: (value) => new TextEncoder().encode(value),
  decode: (value) => new TextDecoder().decode(value),
};

test("local resume drafts survive independently of conversation references", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-resume-draft-"));
  try {
    const repository = new ResumeDraftFileRepository(
      "user-1",
      directory,
      codec,
    );
    const service = new ResumeDraftService("user-1", repository);
    const workspace = await createWorkspace();
    const synced = await service.syncWorkspace({
      conversationId: "conversation-1",
      workspace,
    });
    const checkpointed = await service.ensureGeneratedCheckpoint(
      synced.draft.artifactId,
    );

    assert.equal(checkpointed.title, "产品经理");
    assert.equal(checkpointed.checkpoints.length, 1);
    assert.equal((await service.list()).length, 1);

    const reopened = new ResumeDraftService(
      "user-1",
      new ResumeDraftFileRepository("user-1", directory, codec),
    );
    const restored = await reopened.get(synced.draft.artifactId);
    assert.equal(restored.workspace.candidateId, workspace.candidateId);
    assert.deepEqual(restored.conversationIds, ["conversation-1"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("draft repository rejects cross-user writes and hides foreign records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-resume-owner-"));
  try {
    const userOne = new ResumeDraftService(
      "user-1",
      new ResumeDraftFileRepository("user-1", directory, codec),
    );
    const synced = await userOne.syncWorkspace({
      conversationId: "conversation-1",
      workspace: await createWorkspace(),
    });
    const userTwoRepository = new ResumeDraftFileRepository(
      "user-2",
      directory,
      codec,
    );

    assert.deepEqual(await userTwoRepository.list(), []);
    await assert.rejects(
      userTwoRepository.save(synced.draft),
      /其他用户/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manual edits autosave without creating history until the edit is committed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-resume-edit-"));
  try {
    const compiler = new FixtureResumeCompiler();
    const drafts = new ResumeDraftService(
      "user-1",
      new ResumeDraftFileRepository("user-1", directory, codec),
    );
    const editing = new ResumeDraftEditingService(
      drafts,
      new ResumeManualEditor(compiler),
    );
    const workspace = await createWorkspace();
    const synced = await drafts.syncWorkspace({
      conversationId: "conversation-1",
      workspace,
    });
    const bulletId = firstBulletId(workspace);

    const autosaved = await editing.edit({
      artifactId: synced.draft.artifactId,
      target: { type: "bullet", bulletId },
      text: "基于已有访谈记录整理需求，并保留原始事实引用。",
      createCheckpoint: false,
    });
    assert.equal(autosaved.checkpoints.length, 0);
    assert.equal(
      autosaved.structure.sections
        .flatMap((section) => section.items)
        .flatMap((item) => item.bullets)[0]?.text,
      "基于已有访谈记录整理需求，并保留原始事实引用。",
    );

    const committed = await editing.edit({
      artifactId: synced.draft.artifactId,
      target: { type: "bullet", bulletId },
      text: "基于已有访谈记录整理需求，保留事实引用并支持后续复核。",
    });
    assert.equal(committed.checkpoints.length, 1);
    assert.equal(committed.checkpoints[0]?.reason, "manual_edit");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("AI proposals stay reversible until accepted and create local history on acceptance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-resume-proposal-"));
  try {
    const compiler = new FixtureResumeCompiler();
    const editor = new ResumeManualEditor(compiler);
    const drafts = new ResumeDraftService(
      "user-1",
      new ResumeDraftFileRepository("user-1", directory, codec),
    );
    const base = await createWorkspace();
    const synced = await drafts.syncWorkspace({
      conversationId: "conversation-1",
      workspace: base,
    });
    const bulletId = firstBulletId(base);
    const proposed = await editor.edit(
      base,
      { type: "bullet", bulletId },
      "AI 建议版本，但仍然只使用已有事实。",
    );
    await drafts.proposeChange({
      artifactId: synced.draft.artifactId,
      base,
      proposed,
      summary: "调整首条要点",
    });

    const rejected = await drafts.rejectPendingChange(synced.draft.artifactId);
    assert.equal(rejected.pendingChange, null);
    assert.equal(firstBulletText(rejected.workspace), firstBulletText(base));

    await drafts.proposeChange({
      artifactId: synced.draft.artifactId,
      base,
      proposed,
      summary: "调整首条要点",
    });
    const accepted = await drafts.acceptPendingChange(synced.draft.artifactId);
    assert.equal(accepted.pendingChange, null);
    assert.equal(firstBulletText(accepted.workspace), firstBulletText(proposed));
    assert.equal(accepted.checkpoints.at(-1)?.reason, "ai_change_accepted");
    assert.equal(toResumeDraftDetail(accepted).pendingChange, null);

    const rawTextProposal = await editor.edit(
      accepted.workspace,
      { type: "raw_text", itemId: "item-edu-1" },
      "Python、TypeScript、数据分析与产品需求拆解",
    );
    const pendingRawText = await drafts.proposeChange({
      artifactId: accepted.artifactId,
      base: accepted.workspace,
      proposed: rawTextProposal,
      summary: "调整技能描述",
    });
    assert.equal(pendingRawText.pendingChange?.summary, "调整技能描述");
    assert.deepEqual(pendingRawText.pendingChange?.changedBulletIds, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function createWorkspace() {
  const compiler = new FixtureResumeCompiler();
  const preparer = new ResumeCandidatePreparer(
    createWorkspaceSnapshotBuilder(),
    compiler,
    new ResumeWorkspaceStore(),
    { createCandidateId: () => "resume-candidate-draft-test" },
  );
  const workspace = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
  });
  const binding = createBinding(
    workspace.sourceSnapshot,
    "bullet-draft-test",
    "使用 Python 清洗运营数据产品。",
  );
  const patched = applyCandidatePatch(
    workspace.sourceSnapshot,
    workspace.structure,
    workspace.bindings,
    [
      {
        op: "add_bullet",
        itemId: "item-work-1",
        binding: resolveEvidenceBindingInput(workspace.sourceSnapshot, binding, "bullet-draft-test"),
      },
    ],
  );
  const compileResult = await compiler.compile(patched.structure);
  return {
    ...workspace,
    structure: patched.structure,
    bindings: patched.bindings,
    compileResult,
    status: deriveWorkspaceStatus(compileResult, patched.structure),
    bestSnapshot: {
      revision: workspace.revision,
      structure: structuredClone(patched.structure),
      bindings: structuredClone(patched.bindings),
      compileResult: structuredClone(compileResult),
    },
  };
}

function firstBulletId(workspace: Awaited<ReturnType<typeof createWorkspace>>): string {
  const bullet = workspace.structure.sections
    .flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[0];
  if (!bullet) throw new Error("fixture has no resume bullet");
  return bullet.id;
}

function firstBulletText(workspace: Awaited<ReturnType<typeof createWorkspace>>): string {
  const bullet = workspace.structure.sections
    .flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[0];
  if (!bullet) throw new Error("fixture has no resume bullet");
  return bullet.text;
}
