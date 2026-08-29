import assert from "node:assert/strict";
import test from "node:test";

import { evidenceForModel } from
  "../src/resume/workspace/agent-workspace-evidence.js";
import {
  applyEvidenceAssessment,
  evidenceAssessmentNextAction,
  startEvidenceReassessment,
} from "../src/resume/workspace/evidence-assessment.js";
import type { ResumeCompiler } from
  "../src/resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from
  "../src/resume/workspace/workspace-store.js";
import type { ResumeWorkspace } from
  "../src/resume/workspace/types.js";
import { createApplyResumeContentTool } from
  "../src/tools/agent-orchestrated/apply-content.js";
import { createDeclineResumeMaterialTool } from
  "../src/tools/agent-orchestrated/decline-material.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
  WORK_CONTENT,
} from "./support/resume-workspace-fixture.js";
import {
  completeFixtureWorkUnits,
  withFixtureWorkUnits,
} from "./support/resume-work-unit-fixture.js";

class AssessmentCompiler extends FixtureResumeCompiler {
  public override async compile(
    structure: Parameters<ResumeCompiler["compile"]>[0],
  ) {
    const result = await super.compile(structure);
    const count = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets)
    ).length;
    const usageRatio = count >= 5 ? 0.96 : count >= 4 ? 0.94 : 0.93;
    return {
      ...result,
      qualified: count >= 5,
      pageCount: 1,
      overflowPx: 0,
      usedHeightPx: usageRatio * 1000,
      availableHeightPx: 1000,
      usageRatio,
      bullets: result.bullets.map((bullet) => ({
        ...bullet,
        passed: true,
        lastLineWidthPx: 480,
        lastLineRatio: 0.8,
      })),
      violations: count >= 5
        ? []
        : [{ code: "page_underfilled" as const, message: "underfilled" }],
    };
  }
}

function payload(result: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(result.content[0]?.text ?? "{}"));
}

async function seededWorkspace() {
  const builder = createWorkspaceSnapshotBuilder({
    workContent: `${WORK_CONTENT}补充访谈 8 名业务用户并整理需求优先级。形成上线复盘并整理后续优化清单。`,
  });
  const compiler = new AssessmentCompiler();
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(builder, compiler, store);
  const apply = createApplyResumeContentTool(compiler, store);
  const created = payload(await create.execute("create-assessment", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));
  const evidence = evidenceForModel(store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  created.revision = completeFixtureWorkUnits(store).revision;
  const written = payload(await apply.execute("seed-assessment", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    items: [{
      itemId: "item-work-1",
      bullets: evidence.slice(0, 3).map((entry, index) => withFixtureWorkUnits(
        store.latest()!, {
        bulletId: `item-work-1-bullet-${index + 1}`,
        text: entry.text.replace(/。$/u, ""),
        plannedLines: 2,
        origin: "grounded",
        evidenceIds: [entry.evidenceId],
        requirementIds: ["req-1"],
      })),
    }],
  }));
  const authorized = startEvidenceReassessment({
    ...store.latest()!,
    factNeutralAuthorization: {
      sourceRequestKind: "agent_declared",
      confirmedAt: "2026-08-28T00:00:00.000Z",
      confirmedMessageTimestamp: 1,
    },
  });
  store.replace(authorized, written.revision);
  return { store, apply, evidence };
}

function completeItemWithEvidence(
  workspace: ResumeWorkspace,
  evidence: { evidenceId: string; text: string },
  text = evidence.text.replace(/。$/u, ""),
) {
  const item = workspace.structure.sections.flatMap((section) => section.items)
    .find((entry) => entry.id === "item-work-1")!;
  const provenance = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  return [{
    itemId: item.id,
    bullets: [
      ...item.bullets.map((bullet) => ({
        bulletId: bullet.id,
        text: bullet.text,
        plannedLines: workspace.bulletLinePlans?.[bullet.id]?.plannedLines ?? 2,
        origin: "grounded" as const,
        evidenceIds: provenance.get(bullet.id)?.evidenceIds ?? [],
        workUnitIds: provenance.get(bullet.id)?.workUnitIds ?? [],
        requirementIds: provenance.get(bullet.id)?.requirementIds ?? [],
      })),
      withFixtureWorkUnits(workspace, {
        text,
        plannedLines: 2,
        origin: "grounded" as const,
        evidenceIds: [evidence.evidenceId],
        requirementIds: ["req-1"],
      }),
    ],
  }];
}

test("evidence reassessment lowers the second-round threshold and consumes both rounds", async () => {
  const value = await seededWorkspace();
  const first = evidenceAssessmentNextAction(value.store.latest()!)!;
  assert.equal(first.round, 1);
  assert.equal(first.threshold, "transferable");
  assert.equal(first.evidenceIds.length, 2);

  const assessedOne = applyEvidenceAssessment(value.store.latest()!, 1, [
    { evidenceId: first.evidenceIds[0]!, status: "selected",
      reasonCode: "transferable_method" },
    { evidenceId: first.evidenceIds[1]!, status: "deferred",
      reasonCode: "weak_initial_fit" },
  ]);
  value.store.replace(assessedOne, assessedOne.revision - 1);
  assert.equal(assessedOne.evidenceAssessment!.phase, "grounded_fill_1");

  const roundOneEvidence = value.evidence.find(
    (entry) => entry.evidenceId === first.evidenceIds[0],
  )!;
  const addedOne = payload(await value.apply.execute("add-round-one", {
    candidateId: assessedOne.candidateId,
    expectedRevision: assessedOne.revision,
    items: completeItemWithEvidence(value.store.latest()!, roundOneEvidence),
  }));
  assert.equal(addedOne.nextAction.mode, "assess_evidence");
  assert.equal(addedOne.nextAction.round, 2);
  assert.equal(addedOne.nextAction.threshold, "truthful");
  assert.deepEqual(addedOne.nextAction.allowedStatuses,
    ["selected", "excluded_duplicate", "excluded_invalid"]);

  assert.throws(() => applyEvidenceAssessment(value.store.latest()!, 2, [{
    evidenceId: addedOne.nextAction.evidenceIds[0],
    status: "deferred",
    reasonCode: "still_weak",
  }]), /第 2 轮不允许/u);

  const assessedTwo = applyEvidenceAssessment(value.store.latest()!, 2, [{
    evidenceId: addedOne.nextAction.evidenceIds[0],
    status: "selected",
    reasonCode: "truthful_recent_fallback",
  }]);
  value.store.replace(assessedTwo, assessedTwo.revision - 1);
  const roundTwoEvidence = value.evidence.find(
    (entry) => entry.evidenceId === addedOne.nextAction.evidenceIds[0],
  )!;
  const addedTwo = payload(await value.apply.execute("add-round-two", {
    candidateId: assessedTwo.candidateId,
    expectedRevision: assessedTwo.revision,
    items: completeItemWithEvidence(value.store.latest()!, roundTwoEvidence),
  }));

  assert.equal(addedTwo.revision, assessedTwo.revision + 1);
  assert.equal(value.store.latest()!.evidenceAssessment!.phase, "neutral_closure");
  assert.equal(
    Object.values(value.store.latest()!.evidenceAssessment!.decisions)
      .filter((decision) => decision.status === "used").length,
    5,
  );
});

test("a rejected selected fact advances to the lower-threshold round instead of retrying", async () => {
  const value = await seededWorkspace();
  const first = evidenceAssessmentNextAction(value.store.latest()!)!;
  const assessed = applyEvidenceAssessment(value.store.latest()!, 1, [
    { evidenceId: first.evidenceIds[0]!, status: "selected",
      reasonCode: "transferable_method" },
    { evidenceId: first.evidenceIds[1]!, status: "deferred",
      reasonCode: "weak_initial_fit" },
  ]);
  value.store.replace(assessed, assessed.revision - 1);

  const selectedEvidence = value.evidence.find(
    (entry) => entry.evidenceId === first.evidenceIds[0],
  )!;
  const rejected = payload(await value.apply.execute("reject-round-one", {
    candidateId: assessed.candidateId,
    expectedRevision: assessed.revision,
    items: completeItemWithEvidence(
      value.store.latest()!, selectedEvidence, "带句末标点的无效写入。",
    ),
  }));

  assert.equal(rejected.operation.status, "rejected");
  assert.equal(rejected.nextAction.mode, "assess_evidence");
  assert.equal(rejected.nextAction.round, 2);
  assert.deepEqual(new Set(rejected.nextAction.evidenceIds),
    new Set(first.evidenceIds));
});

test("best-effort protection cannot skip pending reassessment work", async () => {
  const value = await seededWorkspace();
  const current = value.store.latest()!;
  await assert.rejects(createDeclineResumeMaterialTool(
    value.store,
    () => 10,
  ).execute("premature-best-effort", {
    candidateId: current.candidateId,
    expectedRevision: current.revision,
    resolution: "best_effort_stalled",
  }), /证据复评.*不能提前结束/u);
});
