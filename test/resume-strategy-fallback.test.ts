import assert from "node:assert/strict";
import test from "node:test";

import { tailoredResumeFallbackDecision } from
  "../src/resume/strategy/tailored-fallback.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";
import type { ResumeBulletProvenance } from
  "../src/resume/workspace/types.js";
import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";
import { ActionExecutorRegistry } from
  "../src/approvals/executor-registry.js";
import {
  createResumeStrategyChoiceExecutor,
  requestResumeStrategyChoice,
  RESUME_STRATEGY_CHOICE_ACTION,
} from "../src/resume/strategy/choice-approval.js";

test("a tailored resume that exhausts its WorkUnits at 8000 characters offers a normal choice", async () => {
  const { ready } = await createReadySaveFixture();
  const workspace = structuredClone(ready);
  const provenance: ResumeBulletProvenance[] = workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets.map((bullet, index) => ({
      bulletId: bullet.id,
      itemId: item.id,
      origin: "grounded" as const,
      evidenceIds: [`evidence-${item.id}-${index}`],
      requirementIds: [],
      confirmation: "not_required" as const,
    }))),
  );
  workspace.bulletProvenance = provenance;
  const units = provenance.map((entry, index) => {
    const workUnitId = `work-unit-${index + 1}`;
    entry.workUnitIds = [workUnitId];
    return {
      workUnitId,
      itemId: entry.itemId,
      sourceExperienceId: workspace.structure.sections
        .flatMap((section) => section.items)
        .find((item) => item.id === entry.itemId)!.source_experience_id!,
      label: `工作单元 ${index + 1}`,
      kind: "deliverable" as const,
      evidenceIds: [...entry.evidenceIds],
    };
  });
  workspace.workUnitMap = {
    version: "work-units-v1",
    sourceFingerprint: workspace.sourceSnapshot.sourceFingerprint,
    status: "ready",
    units,
  };
  workspace.compileResult.qualified = false;
  workspace.compileResult.violations = [{
    code: "page_underfilled",
    message: "页面不足 92%",
  }];

  const decision = tailoredResumeFallbackDecision(
    workspace,
    "narrative_limit",
  );

  assert.equal(decision?.mode, "choose_resume_strategy");
  assert.deepEqual(decision?.options, [
    "use_general_resume",
    "stop_application",
  ]);
  assert.match(decision?.reason ?? "", /现有经历/u);
  workspace.selectionPolicy = "user_directed";
  assert.equal(tailoredResumeFallbackDecision(
    workspace,
    "narrative_limit",
  ), undefined);
});

test("the fallback is exposed as a two-action product card", async () => {
  const { ready } = await createReadySaveFixture();
  const executors = new ActionExecutorRegistry();
  executors.register(
    RESUME_STRATEGY_CHOICE_ACTION,
    createResumeStrategyChoiceExecutor(),
  );
  const approvals = new ApprovalManager(new ApprovalStore(), executors);

  const request = await requestResumeStrategyChoice(approvals, ready, {
    mode: "choose_resume_strategy",
    options: ["use_general_resume", "stop_application"],
    reason: "现有经历无法支持可信的针对性简历",
  });

  assert.equal(request.actionType, RESUME_STRATEGY_CHOICE_ACTION);
  assert.equal(request.title, "这份岗位暂时无法生成可信的针对性简历");
  assert.match(request.description, /通用简历/u);
  assert.equal(approvals.listPending().length, 1);
});
