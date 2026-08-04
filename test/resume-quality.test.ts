import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { compactResumeGenerationContext } from "../src/agent/context-policy.js";
import { ResumeAlternativeRepairer } from "../src/resume/quality/alternative-repairer.js";
import { ResumeCandidateReviewer } from "../src/resume/quality/candidate-reviewer.js";
import { rankAvailableEvidence } from "../src/resume/quality/evidence-candidates.js";
import { ResumeQualityEvaluator } from "../src/resume/quality/quality-evaluator.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import { resolveEvidenceBindingInputs } from "../src/resume/workspace/evidence-resolution.js";
import { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceError } from "../src/resume/workspace/errors.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import {
  FixtureResumeCompiler,
  createBinding,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

test("quality review detects a near duplicate and bounded alternatives select the repair", async () => {
  const services = await createDuplicateCandidate();
  const reviewed = services.reviewer.review("quality-candidate", 0);
  const duplicateTarget = reviewed.qualityReport?.repairTargets.find(
    (target) => target.type === "near_duplicate_bullet",
  );
  assert.ok(duplicateTarget);
  assert.equal(reviewed.status, "needs_revision");
  assert.equal(
    (reviewed.qualityReport?.score.informationDiversity ?? 1) < 1,
    true,
  );

  await assert.rejects(
    services.patcher.patch({
      candidateId: reviewed.candidateId,
      expectedRevision: 0,
      operations: [{ op: "remove_bullet", bulletId: "bl-1" }],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError &&
      error.code === "quality_repair_requires_alternatives",
  );

  const repaired = await services.repairer.repair({
    candidateId: reviewed.candidateId,
    expectedRevision: 0,
    alternativeTargets: [
      {
        targetId: duplicateTarget.targetId,
        alternatives: [
          {
            label: "keep duplicate",
            operations: [
              {
                op: "replace_bullet",
                bulletId: "bl-1",
                binding: services.duplicateSecond,
              },
            ],
          },
          {
            label: "restore distinct fact",
            operations: [
              {
                op: "replace_bullet",
                bulletId: "bl-1",
                binding: services.distinctSecond,
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(repaired.status, "ready_for_approval");
  assert.equal(repaired.repairRound, 1);
  assert.equal(repaired.qualityReport?.passed, true);
  assert.deepEqual(repaired.repairHistory[0]?.changedBulletIds, ["bl-1"]);
  assert.equal(repaired.repairHistory[0]?.candidatesCompiled, 2);
  assert.equal(repaired.structure.quality_status, "passed");
});

test("quality review stops when a must-have requirement has no source support", async () => {
  const services = await createDuplicateCandidate();
  const workspace = services.store.get("quality-candidate");
  const missingRequirement = {
    id: "req-missing",
    text: "Kubernetes production operations",
    category: "technical",
    importance: "high",
    keywords: ["Kubernetes"],
    weight: 1,
    v2Importance: "must_have",
    v2Category: "technical",
  } as const;
  const snapshot = {
    ...structuredClone(workspace.sourceSnapshot),
    jd: {
      ...structuredClone(workspace.sourceSnapshot.jd),
      requirements: [
        ...structuredClone(workspace.sourceSnapshot.jd.requirements),
        missingRequirement,
      ],
    },
  };
  const report = services.evaluator.evaluate(
    snapshot,
    workspace.structure,
    workspace.bindings,
    workspace.compileResult,
  );

  assert.equal(report.blocking, true);
  assert.ok(
    report.issues.some(
      (issue) => issue.code === "missing_source_for_must_have_requirement",
    ),
  );
});

test("quality review distinguishes repairable coverage and unsupported responsibility", async () => {
  const services = await createDuplicateCandidate();
  const workspace = services.store.get("quality-candidate");
  const pythonRequirement = {
    id: "req-python",
    text: "Python data processing",
    category: "technical",
    importance: "high",
    keywords: ["Python"],
    weight: 1,
    v2Importance: "must_have",
    v2Category: "technical",
  } as const;
  const snapshot = {
    ...structuredClone(workspace.sourceSnapshot),
    jd: {
      ...structuredClone(workspace.sourceSnapshot.jd),
      requirements: [
        ...structuredClone(workspace.sourceSnapshot.jd.requirements),
        pythonRequirement,
      ],
    },
  };
  const structure = structuredClone(workspace.structure);
  structure.sections[1]!.items[0]!.bullets[0]!.text =
    "主导使用 Python 清洗运营数据。";
  const bindings = structuredClone(workspace.bindings);
  bindings[0]!.bulletText = "主导使用 Python 清洗运营数据。";
  const report = services.evaluator.evaluate(
    snapshot,
    structure,
    bindings,
    workspace.compileResult,
  );

  assert.ok(
    report.issues.some(
      (issue) => issue.code === "uncovered_must_have_requirement" && issue.repairable,
    ),
  );
  assert.ok(
    report.issues.some(
      (issue) => issue.code === "unsupported_responsibility_claim",
    ),
  );
});

test("quality alternatives stop after three unsuccessful repair rounds", async () => {
  const services = await createDuplicateCandidate();
  let workspace = services.reviewer.review("quality-candidate", 0);
  for (let round = 1; round <= 3; round += 1) {
    const target = workspace.qualityReport!.repairTargets[0]!;
    workspace = await services.repairer.repair({
      candidateId: workspace.candidateId,
      expectedRevision: workspace.revision,
      alternativeTargets: [
        {
          targetId: target.targetId,
          alternatives: [
            {
              operations: [
                {
                  op: "replace_bullet",
                  bulletId: "bl-1",
                  binding: services.duplicateSecond,
                },
              ],
            },
          ],
        },
      ],
    });
    assert.equal(workspace.repairRound, round);
  }
  assert.equal(workspace.status, "needs_user_decision");
  await assert.rejects(
    services.repairer.repair({
      candidateId: workspace.candidateId,
      expectedRevision: workspace.revision,
      alternativeTargets: [
        {
          targetId: workspace.qualityReport!.repairTargets[0]!.targetId,
          alternatives: [{ operations: [{ op: "remove_bullet", bulletId: "bullet-2" }] }],
        },
      ],
    }),
    (error: unknown) =>
      error instanceof ResumeWorkspaceError && error.code === "repair_round_limit",
  );
});

test("available evidence preserves offsets and excludes consumed ranges", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const snapshot = await buildSnapshot(builder);
  const consumed = createBinding(
    snapshot,
    "bullet-1",
    "使用 Python 清洗运营数据产品。",
  );
  const available = rankAvailableEvidence(
    snapshot,
    resolveEvidenceBindingInputs(snapshot, [consumed], (index) => `bl-${index}`),
  );

  assert.equal(
    available.some(
      (candidate) => candidate.sourceQuote === "使用 Python 清洗运营数据产品。",
    ),
    false,
  );
  for (const candidate of available) {
    const source = snapshot.experiences.find(
      (experience) => experience.id === candidate.experienceId,
    )!;
    assert.equal(
      source.content.slice(candidate.sourceStart, candidate.sourceEnd),
      candidate.sourceQuote,
    );
  }
});

test("LLM context keeps only the latest full resume Workspace result", async () => {
  const messages = [
    toolResult("get_resume_source_snapshot", "very large source ".repeat(100)),
    toolResult("prepare_resume_candidate", "old workspace ".repeat(100)),
    toolResult("patch_resume_candidate", "latest-workspace"),
  ];
  const compacted = await compactResumeGenerationContext(messages);
  const serialized = JSON.stringify(compacted);

  assert.doesNotMatch(serialized, /very large source very large source/);
  assert.doesNotMatch(serialized, /old workspace old workspace/);
  assert.match(serialized, /latest-workspace/);
  assert.ok(serialized.length < JSON.stringify(messages).length / 2);

  const newerSnapshot = toolResult(
    "get_resume_source_snapshot",
    "new-source-must-remain",
  );
  const withNewGeneration = await compactResumeGenerationContext([
    ...messages,
    newerSnapshot,
  ]);
  assert.match(JSON.stringify(withNewGeneration), /new-source-must-remain/);
});

async function createDuplicateCandidate() {
  const builder = createWorkspaceSnapshotBuilder();
  const snapshot = await buildSnapshot(builder);
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const evaluator = new ResumeQualityEvaluator();
  const duplicateSecond = createBinding(
    snapshot,
    "bullet-2",
    "为 3 个团队建立周度报表。",
    "使用 Python 清洗运营数据产品。",
  );
  const distinctSecond = createBinding(
    snapshot,
    "bullet-2",
    "为 3 个团队建立周度报表。",
  );
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "quality-candidate",
  });
  await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
    initialBindings: [
      createBinding(snapshot, "bullet-1", "使用 Python 清洗运营数据产品。"),
      duplicateSecond,
    ],
  });
  return {
    store,
    evaluator,
    duplicateSecond,
    distinctSecond,
    patcher: new ResumeCandidatePatcher(compiler, store),
    reviewer: new ResumeCandidateReviewer(evaluator, store),
    repairer: new ResumeAlternativeRepairer(compiler, evaluator, store),
  };
}

function buildSnapshot(builder: ReturnType<typeof createWorkspaceSnapshotBuilder>) {
  return builder.build({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
}

function toolResult(toolName: string, text: string): AgentMessage {
  return {
    role: "toolResult",
    toolCallId: `call-${toolName}`,
    toolName,
    content: [{ type: "text", text }],
    details: { text },
    isError: false,
    timestamp: 1,
  };
}
