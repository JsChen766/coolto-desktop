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

test("LLM context keeps the latest result per resume tool and compacts older ones", async () => {
  const messages = [
    toolResult("search_experiences", "old-search-body ".repeat(100), "search-old"),
    userMessage("generate a new resume"),
    toolResult("create_resume_workspace", "very large source ".repeat(100), "source"),
    toolResult("get_resume_workspace", "old workspace ".repeat(100), "workspace-old"),
    toolResult("search_experiences", "latest-search-with-ids", "search-latest"),
    toolResult("apply_resume_content", "latest-workspace", "workspace-latest"),
  ];
  const compacted = await compactResumeGenerationContext(messages);
  const serialized = JSON.stringify(compacted);

  // 旧结果被压缩
  assert.doesNotMatch(serialized, /old-search-body/);
  // One source snapshot, one latest workspace and latest discovery result
  // remain authoritative; superseded workspace payloads become receipts.
  assert.match(serialized, /latest-search-with-ids/);
  assert.match(serialized, /very large source very large source/);
  assert.doesNotMatch(serialized, /old workspace old workspace/);
  assert.match(serialized, /latest-workspace/);

  const newerSnapshot = toolResult(
    "create_resume_workspace",
    "new-source-must-remain",
  );
  const withNewGeneration = await compactResumeGenerationContext([
    ...messages,
    newerSnapshot,
  ]);
  assert.match(JSON.stringify(withNewGeneration), /new-source-must-remain/);

  const afterBulkExpansion = JSON.stringify(
    await compactResumeGenerationContext([
      ...messages,
      toolResult("create_resume_workspace", "expanded-source", "source-2"),
    ]),
  );
  assert.doesNotMatch(afterBulkExpansion, /latest-search-with-ids/);
  assert.match(afterBulkExpansion, /expanded-source/);
});

test("LLM context keeps every parallel detail read until the source snapshot exists", async () => {
  const discovery = [
    userMessage("generate a resume"),
    toolResult("get_experience", "experience-one", "experience-1"),
    toolResult("get_experience", "experience-two", "experience-2"),
    toolResult("get_experience", "experience-three", "experience-3"),
  ];
  const beforeSnapshot = JSON.stringify(
    await compactResumeGenerationContext(discovery),
  );
  assert.match(beforeSnapshot, /experience-one/u);
  assert.match(beforeSnapshot, /experience-two/u);
  assert.match(beforeSnapshot, /experience-three/u);

  const afterSnapshot = JSON.stringify(await compactResumeGenerationContext([
    ...discovery,
    toolResult("create_resume_workspace", "locked-source", "source-1"),
  ]));
  assert.doesNotMatch(afterSnapshot, /experience-one|experience-two|experience-three/u);
  assert.match(afterSnapshot, /locked-source/u);
});

test("LLM context drops superseded resume calls and keeps the latest valid arguments", async () => {
  const messages: AgentMessage[] = [
    assistantToolCall("old-call", "apply_resume_content", {
      items: [{ text: "old-large-draft ".repeat(100) }],
    }, "old-candidate-planning ".repeat(100)),
    toolResultWithId("old-call", "apply_resume_content", "old-workspace"),
    assistantToolCall("latest-call", "apply_resume_content", {
      lineRewrites: [{ revisedText: "latest-large-arguments ".repeat(100) }],
    }),
    toolResultWithId("latest-call", "apply_resume_content", "latest-workspace"),
  ];

  const compacted = await compactResumeGenerationContext(messages);
  const serialized = JSON.stringify(compacted);

  assert.doesNotMatch(
    serialized,
    /old-large-draft|old-workspace|old-candidate-planning/u,
  );
  assert.match(serialized, /latest-large-arguments/u);
  assert.match(serialized, /latest-workspace/u);
  assert.doesNotMatch(serialized, /"arguments":\{"compacted":true\}/u);
});

test("LLM context removes stale tail text from the retained tool call", async () => {
  const compacted = await compactResumeGenerationContext([
    assistantToolCall("tail-call", "apply_resume_content", {
      candidateId: "candidate-1",
      expectedRevision: 7,
      tailGrowths: [{
        bulletId: "bullet-1",
        growthText: "stale-tail-text-must-disappear",
      }],
    }),
    toolResultWithId("tail-call", "apply_resume_content", "latest-currentText"),
  ]);
  const serialized = JSON.stringify(compacted);

  assert.doesNotMatch(serialized, /stale-tail-text-must-disappear/u);
  assert.match(serialized, /supersededByFollowingToolResult/u);
  assert.match(serialized, /latest-currentText/u);
});

test("LLM context compacts line rewrites only in tail reflow phase", async () => {
  const reflowResult = {
    ...toolResultWithId(
      "tail-reflow-call",
      "apply_resume_content",
      "latest-reflow-currentText",
    ),
    details: { nextAction: { mode: "batch_tail_reflow" } },
  } as AgentMessage;
  const compacted = await compactResumeGenerationContext([
    assistantToolCall("tail-reflow-call", "apply_resume_content", {
      candidateId: "candidate-1",
      expectedRevision: 8,
      lineRewrites: [{
        bulletId: "bullet-1",
        revisedText: "stale-reflow-text-must-disappear",
      }],
    }),
    reflowResult,
  ]);
  const serialized = JSON.stringify(compacted);

  assert.doesNotMatch(serialized, /stale-reflow-text-must-disappear/u);
  assert.match(serialized, /supersededByFollowingToolResult/u);
  assert.match(serialized, /latest-reflow-currentText/u);
});

test("LLM context keeps only the latest authority in tail repair phase", async () => {
  const tailAuthority = {
    ...toolResultWithId(
      "tail-authority-call",
      "apply_resume_content",
      "latest-tail-currentText-and-sourceQuotes",
    ),
    details: {
      nextAction: { mode: "batch_tail_repair" },
    },
  } as AgentMessage;
  const compacted = await compactResumeGenerationContext([
    userMessage("generate a resume for the target role"),
    toolResult("search_experiences", "discovery-result-must-disappear"),
    toolResult("create_resume_workspace", "source-snapshot-must-disappear"),
    toolResult("apply_resume_content", "old-workspace-must-disappear"),
    tailAuthority,
  ]);
  const serialized = JSON.stringify(compacted);

  assert.match(serialized, /generate a resume for the target role/u);
  assert.match(serialized, /latest-tail-currentText-and-sourceQuotes/u);
  assert.doesNotMatch(
    serialized,
    /discovery-result-must-disappear|source-snapshot-must-disappear|old-workspace-must-disappear/u,
  );
});

test("LLM context drops an old tool error after a newer authoritative success", async () => {
  const failed = {
    ...toolResultWithId(
      "failed-call",
      "apply_resume_content",
      "schema-error-must-not-survive",
    ),
    isError: true,
  } as AgentMessage;
  const compacted = await compactResumeGenerationContext([
    failed,
    toolResultWithId(
      "successful-call",
      "apply_resume_content",
      "latest-successful-workspace",
    ),
  ]);
  const serialized = JSON.stringify(compacted);

  assert.doesNotMatch(serialized, /schema-error-must-not-survive/u);
  assert.match(serialized, /latest-successful-workspace/u);
});

test("LLM context keeps the latest workspace when an exact repeat is blocked", async () => {
  const latestWorkspace = toolResultWithId(
    "successful-call",
    "apply_resume_content",
    "revision-11-currentText-and-lastFailureType",
  );
  const repetitionError = {
    ...toolResultWithId(
      "blocked-call",
      "apply_resume_content",
      "detected_repetition-use-the-latest-workspace",
    ),
    isError: true,
  } as AgentMessage;

  const compacted = await compactResumeGenerationContext([
    latestWorkspace,
    repetitionError,
  ]);
  const serialized = JSON.stringify(compacted);

  assert.match(serialized, /revision-11-currentText-and-lastFailureType/u);
  assert.match(serialized, /detected_repetition-use-the-latest-workspace/u);
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

function toolResult(
  toolName: string,
  text: string,
  toolCallId = `call-${toolName}`,
): AgentMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text }],
    details: { text },
    isError: false,
    timestamp: 1,
  };
}

function toolResultWithId(
  toolCallId: string,
  toolName: string,
  text: string,
): AgentMessage {
  return {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text }],
    details: { text },
    isError: false,
    timestamp: 1,
  };
}

function assistantToolCall(
  id: string,
  name: string,
  args: Record<string, unknown>,
  narration?: string,
): AgentMessage {
  return {
    role: "assistant",
    content: [
      ...(narration ? [{ type: "text" as const, text: narration }] : []),
      { type: "toolCall", id, name, arguments: args },
    ],
    api: "openai-completions",
    provider: "faux",
    model: "faux-model",
    usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: 1,
  };
}

function userMessage(content: string): AgentMessage {
  return { role: "user", content, timestamp: 1 };
}

test("legacy evidence projection stays bounded while the 1M Agent path can request all", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const base = await buildSnapshot(builder);
  const manyExperiences = Array.from({ length: 60 }, (_, index) => ({
    ...(base.experiences[0] as NonNullable<(typeof base.experiences)[number]>),
    id: `many-${index}`,
  }));
  const snapshot = { ...base, experiences: manyExperiences };
  const available = rankAvailableEvidence(snapshot, []);
  assert.ok(
    available.length <= 48,
    `expected at most 48 candidates, got ${available.length}`,
  );
  const complete = rankAvailableEvidence(
    snapshot,
    [],
    Number.POSITIVE_INFINITY,
  );
  assert.ok(complete.length > 48, `expected full evidence, got ${complete.length}`);
});
