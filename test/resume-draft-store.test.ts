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
import { resumeLineSpacingPercent } from "../src/resume/layout-line-spacing.js";
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
      text: "基于已有访谈记录整理需求，并保留原始事实引用",
      createCheckpoint: false,
    });
    assert.equal(autosaved.checkpoints.length, 0);
    assert.equal(
      autosaved.structure.sections
        .flatMap((section) => section.items)
        .flatMap((item) => item.bullets)[0]?.text,
      "基于已有访谈记录整理需求，并保留原始事实引用",
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

test("manual edits preserve cited supplemental numeric evidence", async () => {
  const workspace = await createWorkspace();
  const bulletId = firstBulletId(workspace);
  const item = workspace.structure.sections.flatMap((section) => section.items)
    .find((entry) => entry.bullets.some((bullet) => bullet.id === bulletId))!;
  const binding = workspace.bindings.find((entry) => entry.bulletId === bulletId)!;
  const supplementalId = "supplemental:work-1:market-size";
  const numericText = "使用 Python 清洗运营数据产品，并测算市场空间 260 亿元";
  item.bullets.find((bullet) => bullet.id === bulletId)!.text = numericText;
  binding.bulletText = numericText;
  const supported = {
    ...workspace,
    supplementalEvidence: [{
      evidenceId: supplementalId,
      experienceId: "work-1",
      text: "测算市场空间 260 亿元",
      sourceMessageTimestamp: 200,
      createdAt: "2026-08-26T00:00:00Z",
    }],
    bulletProvenance: [{
      bulletId,
      itemId: item.id,
      origin: "grounded" as const,
      evidenceIds: [
        `${binding.excerpts[0]!.experienceId}:${binding.excerpts[0]!.sourceStart}:${binding.excerpts[0]!.sourceEnd}`,
        supplementalId,
      ],
      requirementIds: [],
      confirmation: "not_required" as const,
    }],
  };

  const edited = await new ResumeManualEditor(new FixtureResumeCompiler()).edit(
    supported,
    { type: "bullet", bulletId },
    `${numericText}，并保持原有事实口径`,
  );
  assert.match(firstBulletText(edited), /260 亿元/u);
});

test("line spacing creates a local revision and rejects any value that exceeds one page", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-resume-spacing-"));
  try {
    const drafts = new ResumeDraftService(
      "user-1",
      new ResumeDraftFileRepository("user-1", directory, codec),
    );
    const editing = new ResumeDraftEditingService(
      drafts,
      new ResumeManualEditor(new FixtureResumeCompiler()),
    );
    const workspace = await createWorkspace();
    const synced = await drafts.syncWorkspace({
      conversationId: "conversation-1",
      workspace,
    });
    const committed = await editing.setLineSpacing({
      artifactId: synced.draft.artifactId,
      expectedRevision: workspace.revision,
      scalePercent: 110,
    });

    assert.equal(resumeLineSpacingPercent(committed.structure), 110);
    assert.equal(committed.revision, workspace.revision + 1);
    assert.equal(committed.checkpoints.at(-1)?.label, "调整行间距");
    await assert.rejects(
      editing.setLineSpacing({
        artifactId: synced.draft.artifactId,
        expectedRevision: workspace.revision,
        scalePercent: 111,
      }),
      /简历已变化到修订/u,
    );

    const overflowCompiler = {
      compile: async () => ({
        ...workspace.compileResult,
        qualified: false,
        pageCount: 2,
        overflowPx: 24,
        usageRatio: 1.02,
        violations: [{
          code: "page_overflow" as const,
          message: "Page overflowed.",
        }],
      }),
    };
    await assert.rejects(
      new ResumeManualEditor(overflowCompiler).setLineSpacing(workspace, 120),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "layout_line_spacing_overflow" &&
        /超过一页/u.test(error.message),
    );
    assert.equal(resumeLineSpacingPercent(workspace.structure), 100);
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

    await assert.rejects(
      editor.edit(
        accepted.workspace,
        { type: "raw_text", itemId: "item-edu-1" },
        "尝试改写固定教育信息",
      ),
      /教育信息来自经历库/u,
    );
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
