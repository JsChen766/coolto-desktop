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
import { createAddResumeMaterialTool } from "../src/tools/agent-orchestrated/add-material.js";
import { createApplyResumeContentTool } from "../src/tools/agent-orchestrated/apply-content.js";
import { createResumeWorkspaceTool } from "../src/tools/agent-orchestrated/create-workspace.js";
import { createPrepareExperienceSyncTool } from "../src/tools/agent-orchestrated/prepare-experience-sync.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

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

function mixedBullets() {
  return [
    {
      text: "使用 Python 清洗运营数据产品",
      origin: "grounded" as const,
      evidenceIds: ["work-1:0:19"],
      requirementIds: ["req-1"],
    },
    {
      text: "建立主动复盘和跨团队协作机制",
      origin: "agent_augmented" as const,
      requirementIds: ["req-1"],
    },
  ];
}

async function applyGroundedShortTail(
  value: Awaited<ReturnType<typeof workspaceHarness>>,
  approvals: ApprovalManager,
) {
  const apply = createApplyResumeContentTool(value.compiler, value.store, approvals);
  const evidence = evidenceForModel(value.store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  const firstText = `${evidence[0]!.text.replace(/。$/, "")}短尾`;
  const initial = resultText(await apply.execute("apply-grounded-tail", {
    candidateId: value.created.candidateId,
    expectedRevision: 0,
    items: [{
      itemId: "item-work-1",
      bullets: [{
        text: firstText,
        origin: "grounded",
        evidenceIds: [evidence[0]!.evidenceId],
        requirementIds: ["req-1"],
      }, {
        text: evidence[1]!.text.replace(/。$/, ""),
        origin: "grounded",
        evidenceIds: [evidence[1]!.evidenceId],
        requirementIds: ["req-1"],
      }],
    }],
  }));
  const bulletId = initial.nextAction.bulletIds[0] as string;
  const fragmentText = "，体现面向目标岗位的主动协作意识";
  const repaired = resultText(await apply.execute("repair-with-fragment", {
    candidateId: value.created.candidateId,
    expectedRevision: initial.revision,
    tailRepairs: [{
      bulletId,
      augmentedModifier: {
        text: fragmentText,
        requirementIds: ["req-1"],
      },
    }],
  }));
  return { apply, bulletId, firstText, fragmentText, repaired };
}

test("agent_augmented content creates a program approval and accept confirms it", async () => {
  const value = await workspaceHarness();
  const approvals = augmentedApproval(value.store, value.compiler);
  const apply = createApplyResumeContentTool(value.compiler, value.store, approvals);
  const payload = resultText(await apply.execute("apply", {
    candidateId: value.created.candidateId,
    expectedRevision: 0,
    items: [{ itemId: "item-work-1", bullets: mixedBullets() }],
  }));

  assert.equal(payload.pendingConfirmation.length, 1);
  assert.ok(payload.approvalRequestId);
  assert.equal(approvals.listPending().length, 1);
  assert.equal(approvals.listPending()[0]?.preview.items?.[0]?.id, undefined);
  const compileCount = value.compiler.structures.length;
  await approvals.resolve(payload.approvalRequestId, { type: "accept" });

  const workspace = value.store.latest()!;
  assert.equal(workspace.revision, 2);
  assert.equal(workspace.compileObservedRevision, 2);
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
    expectedRevision: 0,
    items: [{
      itemId: "item-work-1",
      bullets: [{
        text: "使用 Python 清洗运营数据产品",
        origin: "grounded",
        evidenceIds: ["work-1:0:19"],
        requirementIds: ["req-1"],
      }, {
        origin: "agent_augmented",
        requirementIds: ["req-1"],
        text: "建立主动复盘和跨团队协作机制短尾",
      }],
    }],
  }));

  assert.equal(initial.nextAction.mode, "batch_tail_repair");
  assert.equal(initial.approvalRequestId, undefined);
  assert.equal(approvals.listPending().length, 0);

  const repaired = resultText(await apply.execute("repair-before-confirm", {
    candidateId: value.created.candidateId,
    expectedRevision: initial.revision,
    tailRepairs: [{
      bulletId: initial.nextAction.bulletIds[0],
      augmentedModifier: {
        text: "，明确复盘产出与协作责任",
        requirementIds: ["req-1"],
      },
    }],
  }));
  assert.equal(repaired.nextAction.mode, "await_augmented_confirmation");
  assert.equal(repaired.pendingConfirmation.length, 1);
  assert.equal(repaired.pendingConfirmation[0]?.kind, "bullet");
  assert.ok(repaired.approvalRequestId);
  assert.equal(approvals.listPending().length, 1);
});

test("accepting an augmented tail fragment confirms only the fragment", async () => {
  const value = await workspaceHarness();
  const approvals = augmentedApproval(value.store, value.compiler);
  const result = await applyGroundedShortTail(value, approvals);

  assert.deepEqual(result.repaired.pendingConfirmation, [{
    itemId: "item-work-1",
    bulletId: result.bulletId,
    text: result.fragmentText,
    kind: "fragment",
  }]);
  const request = approvals.listPending()[0]!;
  assert.equal(request.preview.items?.[0]?.title, result.fragmentText);
  const compileCount = value.compiler.structures.length;
  await approvals.resolve(result.repaired.approvalRequestId, { type: "accept" });

  const workspace = value.store.latest()!;
  const provenance = workspace.bulletProvenance?.find(
    (entry) => entry.bulletId === result.bulletId,
  );
  assert.equal(provenance?.origin, "grounded");
  assert.equal(provenance?.confirmation, "not_required");
  assert.equal(workspace.augmentedFragments?.[0]?.confirmation, "confirmed");
  assert.equal(workspace.awaitingUserConfirmation, null);
  assert.equal(value.compiler.structures.length, compileCount);
});

test("rejecting an augmented tail fragment restores the grounded bullet", async () => {
  const value = await workspaceHarness();
  const approvals = augmentedApproval(value.store, value.compiler);
  const result = await applyGroundedShortTail(value, approvals);
  const before = value.store.latest()!;
  const binding = structuredClone(
    before.bindings.find((entry) => entry.bulletId === result.bulletId),
  );
  const compileCount = value.compiler.structures.length;
  await approvals.resolve(result.repaired.approvalRequestId, { type: "reject" });

  const workspace = value.store.latest()!;
  const bullet = workspace.structure.sections.flatMap((section) => section.items)
    .flatMap((item) => item.bullets)
    .find((entry) => entry.id === result.bulletId)!;
  const provenance = workspace.bulletProvenance?.find(
    (entry) => entry.bulletId === result.bulletId,
  );
  assert.equal(bullet.text, result.firstText);
  assert.equal(provenance?.origin, "grounded");
  assert.deepEqual(
    workspace.bindings.find((entry) => entry.bulletId === result.bulletId),
    binding,
  );
  assert.equal(workspace.augmentedFragments?.length, 0);
  assert.equal(value.compiler.structures.length, compileCount + 1);
});

test("rejecting agent_augmented content removes it and recompiles", async () => {
  const value = await workspaceHarness();
  const approvals = augmentedApproval(value.store, value.compiler);
  const apply = createApplyResumeContentTool(value.compiler, value.store, approvals);
  const payload = resultText(await apply.execute("apply", {
    candidateId: value.created.candidateId,
    expectedRevision: 0,
    items: [{ itemId: "item-work-1", bullets: mixedBullets() }],
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
    expectedRevision: 0,
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
    expectedRevision: 1,
    experienceIds: ["work-1"],
  }));

  assert.equal(proposals.executed.length, 0);
  await approvals.resolve(result.approvalRequestId, { type: "accept" });
  assert.deepEqual(proposals.executed, ["proposal-work-1"]);
});

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
