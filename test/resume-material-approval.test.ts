import assert from "node:assert/strict";
import test from "node:test";

import { ActionExecutorRegistry } from "../src/approvals/executor-registry.js";
import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";
import {
  RESUME_AUGMENTED_CONFIRM_ACTION_TYPE,
} from "../src/resume/confirmation/augmented-approval.js";
import { createAugmentedConfirmationExecutor } from "../src/resume/confirmation/augmented-executor.js";
import {
  RESUME_EXPERIENCE_SYNC_ACTION_TYPE,
} from "../src/resume/material/experience-sync-approval.js";
import { createResumeExperienceSyncExecutor } from "../src/resume/material/experience-sync-executor.js";
import type { ResumeExperienceSyncProposalPort } from "../src/resume/material/experience-sync-port.js";
import { evidenceForModel } from "../src/resume/workspace/agent-workspace-evidence.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { resumeGenerationReadiness } from
  "../src/resume/workspace/generation-readiness.js";
import { createAddResumeMaterialTool } from "../src/tools/agent-orchestrated/add-material.js";
import { createApplyResumeContentTool } from "../src/tools/agent-orchestrated/apply-content.js";
import { createResumeWorkspaceTool } from "../src/tools/agent-orchestrated/create-workspace.js";
import { createPrepareExperienceSyncTool } from "../src/tools/agent-orchestrated/prepare-experience-sync.js";
import { createLocalResumeDraft } from "../src/resume/draft/projection.js";
import type {
  LocalResumeDraft,
  ResumeDraftExperienceSyncState,
} from "../src/resume/draft/types.js";
import { syncDraftSupplementalMaterial } from
  "../src/desktop/main/resume-drafts/resume-experience-sync-service.js";
import type {
  ExperienceMaterialCommitInput,
  ExperienceMaterialCommitter,
} from "../src/experience/material-ingestion-types.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";
import {
  completeFixtureWorkUnits,
  withFixtureWorkUnits,
} from "./support/resume-work-unit-fixture.js";

function resultText(result: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(result.content[0]?.text ?? "{}"));
}

async function workspaceHarness() {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(builder, compiler, store);
  const created = resultText(await create.execute("create", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "edu-1" },
      { experienceId: "work-1", tier: "secondary" },
    ],
  }));
  created.revision = completeFixtureWorkUnits(store).revision;
  return { builder, compiler, store, created };
}

function augmentedApproval(
  store: ResumeWorkspaceStore,
  compiler: FixtureResumeCompiler,
) {
  const executors = new ActionExecutorRegistry();
  executors.register(
    RESUME_AUGMENTED_CONFIRM_ACTION_TYPE,
    createAugmentedConfirmationExecutor(store, compiler),
  );
  return new ApprovalManager(new ApprovalStore(), executors);
}

function mixedBullets(
  workspace: NonNullable<ReturnType<ResumeWorkspaceStore["latest"]>>,
) {
  return [
    withFixtureWorkUnits(workspace, {
      text: "使用 Python 清洗运营数据产品",
      origin: "grounded" as const,
      evidenceIds: ["work-1:0:19"],
      requirementIds: ["req-1"],
    }),
    {
      text: "建立主动复盘和跨团队协作机制",
      origin: "agent_augmented" as const,
      requirementIds: ["req-1"],
    },
  ];
}

test("agent_augmented content creates a program approval and accept confirms it", async () => {
  const value = await workspaceHarness();
  const approvals = augmentedApproval(value.store, value.compiler);
  const apply = createApplyResumeContentTool(value.compiler, value.store, approvals);
  const payload = resultText(await apply.execute("apply", {
    candidateId: value.created.candidateId,
    expectedRevision: value.created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: mixedBullets(value.store.latest()!),
    }],
  }));

  assert.equal(payload.pendingConfirmation.length, 1);
  assert.ok(payload.approvalRequestId);
  assert.equal(approvals.listPending().length, 1);
  assert.equal(approvals.listPending()[0]?.preview.items?.[0]?.id, undefined);
  const compileCount = value.compiler.structures.length;
  await approvals.resolve(payload.approvalRequestId, { type: "accept" });

  const workspace = value.store.latest()!;
  assert.equal(workspace.revision, value.created.revision + 2);
  assert.equal(workspace.compileObservedRevision, workspace.revision);
  assert.equal(workspace.bulletProvenance?.some(
    (entry) => entry.confirmation === "pending"), false);
  assert.equal(value.compiler.structures.length, compileCount);

  const groundedId = workspace.structure.sections.flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!.bullets[0]!.id;
  const unchangedConfirmation = resultText(await apply.execute("repair-grounded", {
    candidateId: value.created.candidateId,
    expectedRevision: workspace.revision,
    bulletUpdates: [{
      bulletId: groundedId,
      text: "使用 Python 清洗运营数据产品并形成复盘结论",
    }],
  }));
  assert.equal(unchangedConfirmation.pendingConfirmation.length, 0);
  assert.equal(approvals.listPending().length, 0);

  const afterGroundedRepair = value.store.latest()!;
  const augmentedId = afterGroundedRepair.structure.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!.bullets[1]!.id;
  const changedConfirmation = resultText(await apply.execute("repair-augmented", {
    candidateId: value.created.candidateId,
    expectedRevision: afterGroundedRepair.revision,
    bulletUpdates: [{
      bulletId: augmentedId,
      text: "建立主动复盘和跨团队协作机制并推动结果沉淀",
    }],
  }));
  assert.equal(changedConfirmation.pendingConfirmation.length, 1);
  assert.ok(changedConfirmation.approvalRequestId);
  assert.equal(approvals.listPending().length, 1);
});

test("agent augmentation waits for tail repair before requesting approval", async () => {
  const value = await workspaceHarness();
  const approvals = augmentedApproval(value.store, value.compiler);
  const apply = createApplyResumeContentTool(value.compiler, value.store, approvals);
  const initial = resultText(await apply.execute("apply-short-tail", {
    candidateId: value.created.candidateId,
    expectedRevision: value.created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [withFixtureWorkUnits(value.store.latest()!, {
        text: "使用 Python 清洗运营数据产品",
        origin: "grounded",
        evidenceIds: ["work-1:0:19"],
        requirementIds: ["req-1"],
      }), {
        origin: "agent_augmented",
        requirementIds: ["req-1"],
        text: "建立主动复盘和跨团队协作机制短尾",
      }],
    }],
  }));

  assert.equal(initial.nextAction.mode, "batch_tail_rewrite");
  assert.equal(initial.approvalRequestId, undefined);
  assert.equal(approvals.listPending().length, 0);

  assert.equal(initial.nextAction.bulletIds.length, 1);
  let repaired = initial;
  for (let round = 0;
    round < 2 && repaired.nextAction.mode === "batch_tail_rewrite";
    round += 1) {
    const target = repaired.nextAction.tailRewriteTargets[0];
    const revisedText = round === 0
      ? "建立主动复盘和跨团队协作机制，明确会议结论与责任人"
      : "建立主动复盘和跨团队协作机制，明确议题边界与验收方式";
    repaired = resultText(await apply.execute(`repair-before-confirm-${round}`, {
      candidateId: value.created.candidateId,
      expectedRevision: repaired.revision,
      tailRewrites: [{
        bulletId: target.bulletId,
        candidates: [{ strategy: "expand", revisedText }],
      }],
    }));
  }
  assert.equal(repaired.nextAction.mode, "await_augmented_confirmation");
  assert.equal(repaired.pendingConfirmation.length, 1);
  assert.equal(repaired.pendingConfirmation[0]?.kind, "bullet");
  assert.ok(repaired.approvalRequestId);
  assert.equal(approvals.listPending().length, 1);
});

test("rejecting agent_augmented content removes it and recompiles", async () => {
  const value = await workspaceHarness();
  const approvals = augmentedApproval(value.store, value.compiler);
  const apply = createApplyResumeContentTool(value.compiler, value.store, approvals);
  const payload = resultText(await apply.execute("apply", {
    candidateId: value.created.candidateId,
    expectedRevision: value.created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: mixedBullets(value.store.latest()!),
    }],
  }));
  const before = value.compiler.structures.length;
  await approvals.resolve(payload.approvalRequestId, { type: "reject" });

  const item = value.store.latest()!.structure.sections
    .flatMap((section) => section.items)
    .find((entry) => entry.id === "item-work-1")!;
  assert.equal(item.bullets.length, 1);
  assert.equal(value.compiler.structures.length, before + 1);
});

class FakeExperienceProposals implements ResumeExperienceSyncProposalPort {
  public executed: string[] = [];
  public discarded: string[] = [];
  public currentContent = "";

  public async prepareUpdate(experienceId: string, changes: { content: string }) {
    return {
      id: `proposal-${experienceId}`,
      kind: "update" as const,
      experienceId,
      expectedEntityVersion: 1,
      expectedLocalVersion: 1,
      current: snapshot(experienceId, this.currentContent),
      next: snapshot(experienceId, changes.content),
      errorCode: null,
      preparedAt: "2026-08-17T00:00:00Z",
    };
  }
  public execute(id: string) { this.executed.push(id); return {}; }
  public discard(id: string) { this.discarded.push(id); }
}

test("prepare_experience_sync batches supplemental facts behind approval", async () => {
  const value = await workspaceHarness();
  const add = createAddResumeMaterialTool(value.store, () => 99);
  await add.execute("add", {
    candidateId: value.created.candidateId,
    expectedRevision: value.created.revision,
    experienceId: "work-1",
    facts: ["补充了用户明确提供的新职责范围"],
  });
  const proposals = new FakeExperienceProposals();
  proposals.currentContent = value.store.latest()!.sourceSnapshot.experiences
    .find((item) => item.id === "work-1")!.content;
  const executors = new ActionExecutorRegistry();
  executors.register(
    RESUME_EXPERIENCE_SYNC_ACTION_TYPE,
    createResumeExperienceSyncExecutor(proposals),
  );
  const approvals = new ApprovalManager(new ApprovalStore(), executors);
  const tool = createPrepareExperienceSyncTool(value.store, proposals, approvals);
  const result = resultText(await tool.execute("sync", {
    candidateId: value.created.candidateId,
    expectedRevision: value.created.revision + 1,
    experienceIds: ["work-1"],
  }));

  assert.equal(proposals.executed.length, 0);
  await approvals.resolve(result.approvalRequestId, { type: "accept" });
  assert.deepEqual(proposals.executed, ["proposal-work-1"]);
});

test("supplemental facts auto-capture before the resume qualifies", async () => {
  const value = await workspaceHarness();
  const facts = [
    "覆盖三个业务团队的数据口径核对",
    "保留异常样本与逐项复核记录",
    "交付可复用的周度分析底稿",
  ];
  const add = createAddResumeMaterialTool(value.store, () => 99);
  await add.execute("add-before-qualified", {
    candidateId: value.created.candidateId,
    expectedRevision: value.created.revision,
    experienceId: "work-1",
    facts,
  });
  const draft = createLocalResumeDraft({
    ownerId: "user-1",
    conversationId: "conversation-1",
    workspace: value.store.latest()!,
    artifactId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(resumeGenerationReadiness(draft.workspace).ready, false);

  let currentDraft = draft;
  const drafts = {
    markExperienceSync: async (
      _artifactId: string,
      state: ResumeDraftExperienceSyncState,
    ): Promise<LocalResumeDraft> => {
      currentDraft = { ...currentDraft, experienceSync: state };
      return currentDraft;
    },
  };
  const committer = new FakeMaterialCommitter();
  currentDraft = await syncDraftSupplementalMaterial({
    draft: currentDraft,
    drafts,
    committer,
  });
  assert.deepEqual(committer.inputs[0]?.sections[0]?.text.split("\n"), facts);
  assert.equal(committer.inputs[0]?.target.kind, "existing");
  assert.equal(currentDraft.experienceSync?.status, "accepted");
});

test("qualified draft automatically captures supplemental evidence once", async () => {
  const value = await workspaceHarness();
  const apply = createApplyResumeContentTool(value.compiler, value.store);
  await apply.execute("write-qualified", {
    candidateId: value.created.candidateId,
    expectedRevision: value.created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [withFixtureWorkUnits(value.store.latest()!, {
        text: "使用 Python 清洗运营数据产品",
        origin: "grounded",
        evidenceIds: ["work-1:0:19"],
        requirementIds: ["req-1"],
      }), withFixtureWorkUnits(value.store.latest()!, {
        text: "为 3 个团队建立周度报表",
        origin: "grounded",
        evidenceIds: ["work-1:19:33"],
        requirementIds: ["req-1"],
      })],
    }],
  });
  const add = createAddResumeMaterialTool(value.store, () => 99);
  const added = resultText(await add.execute("add-auto-sync", {
    candidateId: value.created.candidateId,
    expectedRevision: value.store.latest()!.revision,
    experienceId: "work-1",
    facts: ["补充了用户明确提供的新职责范围"],
  }));
  completeFixtureWorkUnits(value.store);
  const beforeMaterialApply = value.store.latest()!;
  const secondBullet = beforeMaterialApply.structure.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === "item-work-1")!.bullets[1]!;
  await apply.execute("apply-auto-sync-material", {
    candidateId: value.created.candidateId,
    expectedRevision: beforeMaterialApply.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [withFixtureWorkUnits(beforeMaterialApply, {
        bulletId: beforeMaterialApply.structure.sections
          .flatMap((section) => section.items)
          .find((item) => item.id === "item-work-1")!.bullets[0]!.id,
        text: "使用 Python 清洗运营数据产品",
        origin: "grounded",
        evidenceIds: ["work-1:0:19"],
        requirementIds: ["req-1"],
      }), withFixtureWorkUnits(beforeMaterialApply, {
        bulletId: secondBullet.id,
        text: "为 3 个团队建立周度报表，补充了用户明确提供的新职责范围",
        origin: "grounded",
        evidenceIds: ["work-1:19:33", added.addedEvidence[0].evidenceId],
        requirementIds: ["req-1"],
      })],
    }],
  });
  const draft = createLocalResumeDraft({
    ownerId: "user-1",
    conversationId: "conversation-1",
    workspace: value.store.latest()!,
    artifactId: "11111111-1111-4111-8111-111111111111",
  });
  assert.deepEqual(resumeGenerationReadiness(draft.workspace).blockers, []);
  let currentDraft = draft;
  const drafts = {
    markExperienceSync: async (
      _artifactId: string,
      state: ResumeDraftExperienceSyncState,
    ): Promise<LocalResumeDraft> => {
      currentDraft = { ...currentDraft, experienceSync: state };
      return currentDraft;
    },
  };
  const committer = new FakeMaterialCommitter();
  currentDraft = await syncDraftSupplementalMaterial({
    draft: currentDraft,
    drafts,
    committer,
  });
  assert.equal(currentDraft.experienceSync?.status, "accepted");
  assert.equal(committer.inputs.length, 1);
  const repeated = await syncDraftSupplementalMaterial({
    draft: currentDraft,
    drafts,
    committer,
  });
  assert.equal(repeated.experienceSync?.status, "accepted");
  assert.equal(committer.inputs.length, 1);
});

class FakeMaterialCommitter implements ExperienceMaterialCommitter {
  inputs: ExperienceMaterialCommitInput[] = [];

  async commit(input: ExperienceMaterialCommitInput) {
    this.inputs.push(structuredClone(input));
    return {
      experienceId: input.target.kind === "existing"
        ? input.target.experienceId : "created-experience",
      title: input.target.kind === "new" ? input.target.title : "数据分析实习生",
      created: input.target.kind === "new", duplicate: false,
      addedCharacters: input.sections.reduce((sum, section) => sum + section.text.length, 0),
      sectionCount: input.sections.length,
      numberCount: input.numberCount,
      criticalOutputCount: input.criticalOutputCount,
    };
  }
}

function snapshot(id: string, content: string) {
  return {
    id,
    category: "work" as const,
    title: "数据分析实习生",
    content,
    organization: "Example",
    role: "数据团队",
    location: null,
    startDate: null,
    endDate: null,
    tags: [],
    resumeSectionKey: null,
    resumeSectionLabel: null,
    status: "active" as const,
    revisionId: "rev-1",
    revisionHash: "hash",
  };
}
