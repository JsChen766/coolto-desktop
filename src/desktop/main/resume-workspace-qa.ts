import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../../resume/template-contract.js";
import { ResumeCandidatePatcher } from "../../resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../../resume/workspace/candidate-preparer.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { ResumeQualityEvaluator } from "../../resume/quality/quality-evaluator.js";
import { ResumeCandidateReviewer } from "../../resume/quality/candidate-reviewer.js";
import { ResumeAlternativeRepairer } from "../../resume/quality/alternative-repairer.js";
import {
  createResumeWorkspaceQaFixture,
  evidenceBindingInputFrom,
  qaBindingFor,
  selectComparableBindingPair,
} from "./resume-workspace-qa-fixture.js";

export async function runResumeWorkspaceQa(compiler: ResumeCompiler) {
  const { builder, sourceItems, experienceIds } =
    createResumeWorkspaceQaFixture();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "g3-chromium-qa",
  });
  const patcher = new ResumeCandidatePatcher(compiler, store);
  const evaluator = new ResumeQualityEvaluator();
  const reviewer = new ResumeCandidateReviewer(evaluator, store);
  const repairer = new ResumeAlternativeRepairer(compiler, evaluator, store);
  const snapshot = await builder.build({
    jdId: "qa-jd",
    experienceIds,
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const prepared = await preparer.prepare({
    jdId: "qa-jd",
    experienceIds,
    language: "zh-CN",
  });
  const bindingEntries = sourceItems.flatMap(({ item }) =>
    item.bullets.map((bullet) => ({
      itemId: `item-${item.source_experience_id}`,
      binding: qaBindingFor(snapshot, item, bullet.id, bullet.text),
    })),
  );
  const patched = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: bindingEntries.map((entry) => ({
      op: "add_bullet" as const,
      itemId: entry.itemId,
      binding: entry.binding,
    })),
  });
  const [sourceBinding, targetBinding] = selectComparableBindingPair(
    patched.bindings,
    patched.compileResult,
  );
  const duplicateBinding = {
    ...structuredClone(targetBinding),
    bulletText: sourceBinding.bulletText,
  };
  const duplicated = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 1,
    operations: [
      {
        op: "replace_bullet",
        bulletId: targetBinding.bulletId,
        binding: evidenceBindingInputFrom(duplicateBinding),
      },
    ],
  });
  const reviewed = reviewer.review(prepared.candidateId, 2);
  const duplicateTarget = reviewed.qualityReport?.repairTargets.find(
    (target) => target.type === "near_duplicate_bullet",
  );
  if (!duplicateTarget) throw new Error("G4 Chromium QA did not find duplicate target");
  const repaired = await repairer.repair({
    candidateId: prepared.candidateId,
    expectedRevision: 2,
    alternativeTargets: [
      {
        targetId: duplicateTarget.targetId,
        alternatives: [
          {
            label: "restore distinct grounded bullet",
            operations: [
              {
                op: "replace_bullet",
                bulletId: targetBinding.bulletId,
                binding: evidenceBindingInputFrom(targetBinding),
              },
            ],
          },
        ],
      },
    ],
  });
  return {
    preparedStatus: prepared.status,
    g3Status: patched.status,
    duplicateStatus: duplicated.status,
    reviewStatus: reviewed.status,
    finalStatus: repaired.status,
    revision: repaired.revision,
    repairRound: repaired.repairRound,
    bindingCount: repaired.bindings.length,
    sourceFingerprint: repaired.sourceSnapshot.sourceFingerprint,
    compileResult: repaired.compileResult,
    repairDiagnostic: repaired.repairHistory[0],
  };
}
