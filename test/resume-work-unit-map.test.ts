import assert from "node:assert/strict";
import test from "node:test";

import { structuralEvidenceCandidates } from
  "../src/resume/quality/evidence-candidates.js";
import { resumeAgentNextAction } from
  "../src/resume/workspace/agent-next-action.js";
import {
  applyResumeWorkUnitInputs,
  workUnitGroupingAction,
} from "../src/resume/workspace/work-unit-map.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import { createApplyResumeContentTool } from
  "../src/tools/agent-orchestrated/apply-content.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

test("WorkUnit grouping covers every evidence exactly once and yields stable IDs", async () => {
  const { workspace } = await pendingWorkspace();
  const action = workUnitGroupingAction(workspace)!;
  const evidenceIds = action.itemTargets[0]!.evidence.map(
    (entry) => entry.evidenceId,
  );
  assert.equal(resumeAgentNextAction(workspace).mode, "group_work_units");

  const input = [{
    itemId: "item-work-1",
    units: [{ label: "运营数据周报", kind: "report" as const, evidenceIds }],
  }];
  const first = applyResumeWorkUnitInputs(workspace, input);
  const second = applyResumeWorkUnitInputs(workspace, input);

  assert.equal(first.workUnitMap?.status, "ready");
  assert.deepEqual(first.workUnitMap?.units[0]?.evidenceIds, evidenceIds);
  assert.equal(
    first.workUnitMap?.units[0]?.workUnitId,
    second.workUnitMap?.units[0]?.workUnitId,
  );
});

test("WorkUnit grouping rejects omitted and duplicate evidence", async () => {
  const { workspace } = await pendingWorkspace();
  const evidenceIds = workUnitGroupingAction(workspace)!.itemTargets[0]!
    .evidence.map((entry) => entry.evidenceId);
  assert.throws(() => applyResumeWorkUnitInputs(workspace, [{
    itemId: "item-work-1",
    units: [{
      label: "不完整报告", kind: "report", evidenceIds: evidenceIds.slice(0, 1),
    }],
  }]), /未分组 evidence/u);
  assert.throws(() => applyResumeWorkUnitInputs(workspace, [{
    itemId: "item-work-1",
    units: [
      { label: "报告 A", kind: "report", evidenceIds: [evidenceIds[0]!] },
      { label: "报告 B", kind: "report", evidenceIds },
    ],
  }]), /duplicate=/u);
});

test("one WorkUnit cannot be split across two bullets", async () => {
  const { compiler, store, workspace } = await pendingWorkspace();
  const evidence = structuralEvidenceCandidates(workspace.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  const grouped = store.replace(applyResumeWorkUnitInputs(workspace, [{
    itemId: "item-work-1",
    units: [{
      label: "一份完整研究报告", kind: "report",
      evidenceIds: evidence.map((entry) => entry.evidenceId),
    }],
  }]), workspace.revision);
  const workUnitId = grouped.workUnitMap!.units[0]!.workUnitId;
  const result = payload(await createApplyResumeContentTool(
    compiler, store,
  ).execute("split-work-unit", {
    candidateId: grouped.candidateId,
    expectedRevision: grouped.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [
        groundedBullet("完成运营数据产品与周度报表", evidence, workUnitId),
        groundedBullet("建立异常检查规则并开展跨团队协作", evidence, workUnitId),
      ],
    }],
  }));

  assert.equal(store.latest()!.structure.sections.flatMap(
    (section) => section.items,
  ).find((item) => item.id === "item-work-1")!.bullets.length, 1);
  assert.match(JSON.stringify(result.operation.rejectedItems), /不能拆到多条/u);
});

test("one bullet may own multiple complete WorkUnits", async () => {
  const { compiler, store, workspace } = await pendingWorkspace();
  const evidence = structuralEvidenceCandidates(workspace.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  const grouped = store.replace(applyResumeWorkUnitInputs(workspace, [{
    itemId: "item-work-1",
    units: [
      { label: "数据清洗", kind: "responsibility", evidenceIds: [evidence[0]!.evidenceId] },
      { label: "周报与检查", kind: "report", evidenceIds: evidence.slice(1).map((entry) => entry.evidenceId) },
    ],
  }]), workspace.revision);
  const ids = grouped.workUnitMap!.units.map((unit) => unit.workUnitId);
  const result = payload(await createApplyResumeContentTool(
    compiler, store,
  ).execute("combine-work-units", {
    candidateId: grouped.candidateId,
    expectedRevision: grouped.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [groundedBullet(
        "使用 Python 清洗运营数据产品，为 3 个团队建立周度报表并设计异常检查规则",
        evidence,
        ids,
      )],
    }],
  }));

  assert.equal(result.operation.appliedItemIds[0], "item-work-1");
  assert.deepEqual(store.latest()!.bulletProvenance?.[0]?.workUnitIds, ids);
});

async function pendingWorkspace() {
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  await createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), compiler, store,
  ).execute("create", {
    jdId: "jd-1", language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  });
  return { compiler, store, workspace: store.latest()! };
}

function groundedBullet(
  text: string,
  evidence: ReturnType<typeof structuralEvidenceCandidates>,
  workUnitIds: string | string[],
) {
  return {
    text, plannedLines: 4, origin: "grounded" as const,
    evidenceIds: evidence.map((entry) => entry.evidenceId),
    workUnitIds: Array.isArray(workUnitIds) ? workUnitIds : [workUnitIds],
    requirementIds: ["req-1"],
  };
}

function payload(value: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(value.content[0]?.text ?? "{}");
}
