import assert from "node:assert/strict";
import test from "node:test";

import { allEvidenceCandidates } from "../src/resume/quality/evidence-candidates.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createPrepareResumeDraftTool } from "../src/tools/agent-orchestrated/prepare-draft.js";
import { createWriteBulletTool } from "../src/tools/agent-orchestrated/write-bullet.js";
import { createInspectResumeDraftTool } from "../src/tools/agent-orchestrated/inspect-draft.js";
import { validateAndBuildBullet } from "../src/tools/agent-orchestrated/bullet-validator.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

function createHarness() {
  const snapshotBuilder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const prepare = createPrepareResumeDraftTool(snapshotBuilder, compiler, store);
  const writeBullet = createWriteBulletTool(store);
  const inspectDraft = createInspectResumeDraftTool(compiler, store);
  return { snapshotBuilder, compiler, store, prepare, writeBullet, inspectDraft };
}

function resultText(result: {
  content: readonly { type: string; text?: string }[];
}): string {
  return String(result.content[0]?.text ?? "");
}

async function prepareDraft(
  harness: ReturnType<typeof createHarness>,
  language: "zh-CN" | "en-US" = "zh-CN",
) {
  return harness.prepare.execute("t1", {
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language,
  });
}

test("prepare_resume_draft creates an idempotent skeleton workspace", async () => {
  const harness = createHarness();
  const first = await prepareDraft(harness);
  const firstJson = JSON.parse(resultText(first)) as {
    candidateId: string;
    revision: number;
    sourceFingerprint: string;
  };
  assert.ok(firstJson.candidateId.startsWith("draft-"));
  assert.equal(firstJson.revision, 0);
  const second = await prepareDraft(harness);
  const secondJson = JSON.parse(resultText(second)) as {
    candidateId: string;
    revision: number;
  };
  assert.equal(secondJson.candidateId, firstJson.candidateId);
  assert.equal(secondJson.revision, firstJson.revision);
});

test("write_bullet requires an existing draft", async () => {
  const harness = createHarness();
  await assert.rejects(
    harness.writeBullet.execute("t2", {
      itemId: "item-work-1",
      evidenceIds: ["work-1:0:15"],
      bulletText: "使用 Python 清洗运营数据产品，沉淀可复用流程。",
    }),
    /prepare_resume_draft/,
  );
});

test("write_bullet accepts a valid bullet and increments revision", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.find((candidate) => candidate.experienceId === "work-1")!;
  const result = await harness.writeBullet.execute("t3", {
    itemId: "item-work-1",
    evidenceIds: [work.evidenceId],
    bulletText:
      "使用 Python 清洗运营数据产品，设计异常检查规则并与业务团队持续协作，沉淀可复用的处理流程，建立周度报表机制并支撑多轮迭代交付。",
    targetChars: { min: 80, max: 160 },
  });
  const json = JSON.parse(resultText(result)) as {
    accepted: boolean;
    bulletId: string;
    revision: number;
  };
  assert.equal(json.accepted, true);
  assert.equal(json.revision, 1);
  assert.match(json.bulletId, /^item-work-1-b\d+$/);
  const latest = harness.store.latest()!;
  assert.equal(latest.bindings.length, 1);
  assert.equal(
    latest.structure.sections
      .flatMap((section) => section.items)
      .find((item) => item.id === "item-work-1")!.bullets.length,
    1,
  );
});

test("write_bullet rejects evidence outside the item experience", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const edu = candidates.find((candidate) => candidate.experienceId === "edu-1")!;
  await assert.rejects(
    harness.writeBullet.execute("t4", {
      itemId: "item-work-1",
      evidenceIds: [edu.evidenceId],
      bulletText: "主修信息系统与数据分析，掌握数据产品方法论。",
    }),
    /不属于经历 work-1/,
  );
});

test("write_bullet rejects already-consumed evidence", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.find((candidate) => candidate.experienceId === "work-1")!;
  await harness.writeBullet.execute("t5", {
    itemId: "item-work-1",
    evidenceIds: [work.evidenceId],
    bulletText: "使用 Python 清洗运营数据产品并建立周度报表机制。",
    targetChars: { min: 20, max: 300 },
  });
  await assert.rejects(
    harness.writeBullet.execute("t6", {
      itemId: "item-work-1",
      evidenceIds: [work.evidenceId],
      bulletText: "清洗数据产品并交付可用的报表给业务团队使用。",
      targetChars: { min: 20, max: 300 },
    }),
    /不能重复使用/,
  );
});

test("write_bullet rejects numbers absent from the evidence", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.find((candidate) => candidate.experienceId === "work-1")!;
  await assert.rejects(
    harness.writeBullet.execute("t7", {
      itemId: "item-work-1",
      evidenceIds: [work.evidenceId],
      bulletText: "使用 Python 清洗数据，服务 99 个内部团队。",
      targetChars: { min: 20, max: 300 },
    }),
    /数字 99 在证据原文中不存在/,
  );
});

test("write_bullet rejects repeated fragments and out-of-target length", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.find((candidate) => candidate.experienceId === "work-1")!;
  await assert.rejects(
    harness.writeBullet.execute("t8", {
      itemId: "item-work-1",
      evidenceIds: [work.evidenceId],
      bulletText: `使用 Python 清洗数据，${"沉淀可复用流程。".repeat(4)}`,
      targetChars: { min: 20, max: 300 },
    }),
    /重复片段/,
  );
  await assert.rejects(
    harness.writeBullet.execute("t9", {
      itemId: "item-work-1",
      evidenceIds: [work.evidenceId],
      bulletText: "太短",
      targetChars: { min: 80, max: 160 },
    }),
    /超出目标/,
  );
});

test("write_bullet defaults to language targets after evidence and number checks", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.find((candidate) => candidate.experienceId === "work-1")!;
  const edu = candidates.find((candidate) => candidate.experienceId === "edu-1")!;

  await assert.rejects(
    harness.writeBullet.execute("t-default-source", {
      itemId: "item-work-1",
      evidenceIds: [edu.evidenceId],
      bulletText: "99",
    }),
    /不属于经历 work-1/,
  );
  await assert.rejects(
    harness.writeBullet.execute("t-default-number", {
      itemId: "item-work-1",
      evidenceIds: [work.evidenceId],
      bulletText: "99",
    }),
    /数字 99 在证据原文中不存在/,
  );
  await assert.rejects(
    harness.writeBullet.execute("t-default-zh", {
      itemId: "item-work-1",
      evidenceIds: [work.evidenceId],
      bulletText: "太短",
    }),
    /长度 2 超出目标 75-165/,
  );

  const english = createHarness();
  await prepareDraft(english, "en-US");
  const englishWork = allEvidenceCandidates(
    english.store.latest()!.sourceSnapshot,
  ).find((candidate) => candidate.experienceId === "work-1")!;
  await assert.rejects(
    english.writeBullet.execute("t-default-en", {
      itemId: "item-work-1",
      evidenceIds: [englishWork.evidenceId],
      bulletText: "short",
    }),
    /长度 5 超出目标 130-310/,
  );
});

test("parallel write_bullet calls serialize without revision conflicts", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.filter((candidate) => candidate.experienceId === "work-1");
  const texts = [
    "使用 Python 清洗运营数据产品，建立可复用的处理流程，支撑团队高效交付。",
    "为 3 个团队建立周度报表，设计异常检查规则并与业务团队协作落地。",
  ];
  const results = await Promise.all(
    work.slice(0, 2).map((candidate, index) =>
      harness.writeBullet.execute(`p${index}`, {
        itemId: "item-work-1",
        evidenceIds: [candidate.evidenceId],
        bulletText: texts[index]!,
        targetChars: { min: 20, max: 300 },
      }),
    ),
  );
  for (const result of results) {
    const json = JSON.parse(resultText(result)) as { accepted: boolean };
    assert.equal(json.accepted, true);
  }
  const latest = harness.store.latest()!;
  assert.equal(latest.revision, 2);
  assert.equal(latest.bindings.length, 2);
});

test("inspect_resume_draft compiles the draft and reports status", async () => {
  const harness = createHarness();
  await assert.rejects(
    harness.inspectDraft.execute("t10", {}),
    /prepare_resume_draft/,
  );
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.filter((candidate) => candidate.experienceId === "work-1");
  for (const [index, candidate] of work.slice(0, 2).entries()) {
    await harness.writeBullet.execute(`t11-${index}`, {
      itemId: "item-work-1",
      evidenceIds: [candidate.evidenceId],
      bulletText:
        index === 0
          ? "使用 Python 清洗运营数据产品，建立可复用的处理流程，支撑团队高效交付。"
          : "为 3 个团队建立周度报表，设计异常检查规则并与业务团队协作落地。",
      targetChars: { min: 20, max: 300 },
    });
  }
  const result = await harness.inspectDraft.execute("t12", {});
  const json = JSON.parse(resultText(result)) as {
    status: string;
    revision: number;
  };
  assert.equal(json.status, "layout_qualified");
  assert.equal(json.revision, 2);
});

test("cross-bullet repetition ignores shared evidence source quotes", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.filter((candidate) => candidate.experienceId === "work-1");
  const item = workspace.structure.sections
    .flatMap((section) => section.items)
    .find((candidate) => candidate.id === "item-work-1")!;
  const shared = work[0]!.sourceQuote;
  const first = validateAndBuildBullet(
    workspace.sourceSnapshot,
    item,
    [],
    [work[0]!.evidenceId],
    `${shared}并沉淀可复用的处理流程。`,
  );
  assert.ok(first.ok);
  if (!first.ok) return;
  const second = validateAndBuildBullet(
    workspace.sourceSnapshot,
    item,
    [first.binding],
    [work[1]!.evidenceId],
    `${shared}并支撑团队月度复盘与迭代交付。`,
  );
  assert.ok(
    second.ok,
    "shared evidence wording must not count as repetition",
  );
});

test("cross-experience repetition still rejects duplicated model wording", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.find((candidate) => candidate.experienceId === "work-1")!;
  const education = candidates.find((candidate) => candidate.experienceId === "edu-1")!;
  const items = workspace.structure.sections.flatMap((section) => section.items);
  const workItem = items.find((candidate) => candidate.id === "item-work-1")!;
  const educationItem = items.find((candidate) => candidate.id === "item-edu-1")!;
  const wording = "沉淀团队协作与数据流程产品化的核心能力。";
  const first = validateAndBuildBullet(
    workspace.sourceSnapshot,
    workItem,
    [],
    [work.evidenceId],
    `${work.sourceQuote}${wording}`,
  );
  assert.ok(first.ok);
  if (!first.ok) return;
  const second = validateAndBuildBullet(
    workspace.sourceSnapshot,
    educationItem,
    [first.binding],
    [education.evidenceId],
    `${education.sourceQuote}${wording}`,
  );
  assert.equal(second.ok, false);
  if (!second.ok) assert.match(second.reason, /非证据措辞/);
});

test("inspect_resume_draft reports tail deficits without writing content", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.filter((candidate) => candidate.experienceId === "work-1");
  await harness.writeBullet.execute("t13", {
    itemId: "item-work-1",
    evidenceIds: [work[0]!.evidenceId],
    bulletText: "使用 Python 清洗运营数据产品，短尾修复测试内容。",
    targetChars: { min: 20, max: 300 },
  });
  const before = harness.store.latest()!;
  assert.equal(before.bindings.length, 1);
  const result = await harness.inspectDraft.execute("t14", {});
  const json = JSON.parse(resultText(result)) as {
    revision: number;
    bulletTailDiagnostics: Array<{ shortByChars: number }>;
  };
  const after = harness.store.latest()!;
  assert.equal(json.revision, after.revision);
  assert.equal(after.revision, before.revision, "inspect must not modify the draft");
  assert.equal(
    after.bindings[0]!.bulletText,
    before.bindings[0]!.bulletText,
    "host must not write content; tail fixes belong to the agent",
  );
  assert.ok(
    json.bulletTailDiagnostics.length > 0 &&
      json.bulletTailDiagnostics.every(
        (diagnostic) => diagnostic.shortByChars >= 1,
      ),
    "tail deficit must be reported to the agent for self-repair",
  );
});

test("validateAndBuildBullet derives matched requirements from evidence", async () => {
  const harness = createHarness();
  await prepareDraft(harness);
  const workspace = harness.store.latest()!;
  const candidates = allEvidenceCandidates(workspace.sourceSnapshot);
  const work = candidates.find(
    (candidate) =>
      candidate.experienceId === "work-1" &&
      candidate.sourceQuote.includes("数据产品"),
  )!;
  const item = workspace.structure.sections
    .flatMap((section) => section.items)
    .find((candidate) => candidate.id === "item-work-1")!;
  const validated = validateAndBuildBullet(
    workspace.sourceSnapshot,
    item,
    [],
    [work.evidenceId],
    "使用 Python 清洗运营数据产品并建立周度报表机制。",
  );
  assert.ok(validated.ok);
  if (validated.ok) {
    assert.ok(validated.binding.matchedRequirementIds.includes("req-1"));
  }
});
