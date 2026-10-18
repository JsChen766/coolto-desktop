import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { MatchReportStore } from "../src/match/report-store.js";
import { createPrepareMatchAnalysisTool } from "../src/tools/prepare-match-analysis.js";
import type {
  ExperienceReader,
  JdReader,
  JdRecord,
} from "../src/api/types.js";

function makeJdRecord(overrides: Partial<JdRecord> = {}): JdRecord {
  return {
    id: "jd-123",
    title: "高级前端工程师",
    company: "字节跳动",
    targetRole: null,
    sourceKind: "pasted",
    sourceUrl: null,
    rawText: "招聘前端工程师",
    requirements: [
      { id: "req-1", text: "5年前端经验", category: "experience", importance: "high", keywords: [], weight: null, v2Importance: "must_have", v2Category: null },
      { id: "req-2", text: "精通 React", category: "skill", importance: "high", keywords: [], weight: null, v2Importance: "preferred", v2Category: null },
    ],
    jdHash: "hash-abc",
    requirementMapId: null,
    requirementsOrigin: "extracted",
    sourceThreadId: null,
    entityVersion: 1,
    deletedAt: null,
    createdAt: "2026-07-24T00:00:00Z",
    updatedAt: "2026-07-24T00:00:00Z",
    ...overrides,
  };
}

function makeJdReader(jd: JdRecord = makeJdRecord()): JdReader {
  return {
    listJds: async () => ({ items: [], nextCursor: null }),
    getJd: async () => jd,
  };
}

const experienceContent = "主导 React 组件开发";
const experienceHash = createHash("sha256")
  .update(experienceContent)
  .digest("hex");

function makeExperienceReader(): ExperienceReader {
  return {
    searchExperiences: async () => ({ items: [], nextCursor: null }),
    getExperience: async (id) => ({
      id,
      category: "work",
      title: "Frontend Engineer",
      organization: null,
      role: null,
      location: null,
      startDate: null,
      endDate: null,
      tags: [],
      status: "active",
      currentRevisionId: "rev-1",
      currentRevision: {
        id: "rev-1",
        experienceId: id,
        content: experienceContent,
        source: "manual",
        revisionHash: experienceHash,
        factBankStatus: "not_applicable",
        createdAt: "2026-07-24T00:00:00Z",
      },
      revisions: [],
      createdAt: "2026-07-24T00:00:00Z",
      updatedAt: "2026-07-24T00:00:00Z",
      entityVersion: 1,
      deletedAt: null,
      syncStatus: "clean",
    }),
  };
}

function makeTool(jdReader: JdReader, store: MatchReportStore) {
  return createPrepareMatchAnalysisTool(jdReader, makeExperienceReader(), store);
}

const validParams = {
  jdId: "jd-123",
  dimensions: [
    { dimension: "skills" as const, score: 80, rationale: "good" },
    { dimension: "experience" as const, score: 70, rationale: "ok" },
    { dimension: "education" as const, score: 75, rationale: "ok" },
    { dimension: "overallImpression" as const, score: 65, rationale: "ok" },
  ],
  highlights: [
    {
      requirementId: "req-2",
      requirementText: "精通 React",
      summary: "候选人有 React 项目经验",
      evidence: [{ experienceId: "exp-1", revisionId: "rev-1", revisionContentHash: "ch-1", sourceQuote: "主导 React 组件开发" }],
    },
  ],
  gaps: [
    { requirementId: "req-1", requirementText: "5年前端经验", severity: "must_have" as const, explanation: "仅3年经验", suggestion: "补充项目时长" },
  ],
  usedExperiences: [{
    experienceId: "exp-1",
    revisionId: "rev-1",
    contentHash: experienceHash,
  }],
  coverageRatio: 0.5,
  evidenceCompleteness: 0.8,
};

test("tool stores report in MatchReportStore after execution", async () => {
  const store = new MatchReportStore();
  const tool = makeTool(makeJdReader(), store);

  await tool.execute("call-1", validParams);

  assert.equal(store.size(), 1);
});

test("tool result contains reportId", async () => {
  const store = new MatchReportStore();
  const tool = makeTool(makeJdReader(), store);

  const result = await tool.execute("call-1", validParams);

  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  const summary = JSON.parse(text) as { reportId: string };
  assert.ok(summary.reportId.startsWith("match-report-"), `reportId: ${summary.reportId}`);
});

test("tool result contains jdTitle from the JD reader", async () => {
  const store = new MatchReportStore();
  const jd = makeJdRecord({ title: "产品经理" });
  const tool = makeTool(makeJdReader(jd), store);

  const result = await tool.execute("call-1", validParams);

  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  const summary = JSON.parse(text) as { jdTitle: string };
  assert.equal(summary.jdTitle, "产品经理");
});

test("tool finalScore is computed from fixed weights, not passed as-is", async () => {
  const store = new MatchReportStore();
  const tool = makeTool(makeJdReader(), store);

  await tool.execute("call-1", validParams);

  const entry = store.getLatest();
  const expected = Math.round((80 * 0.4 + 70 * 0.35 + 75 * 0.15 + 65 * 0.1) * 10) / 10;
  assert.equal(entry?.report.finalScore, expected);
});

test("store entry has correct jdTitle and jdCompany from JD", async () => {
  const store = new MatchReportStore();
  const jd = makeJdRecord({ title: "SRE", company: "腾讯" });
  const tool = makeTool(makeJdReader(jd), store);

  await tool.execute("call-1", validParams);

  const entry = store.getLatest();
  assert.equal(entry?.jdTitle, "SRE");
  assert.equal(entry?.jdCompany, "腾讯");
});

test("tool reads jdId from JD reader to build jd reference", async () => {
  const store = new MatchReportStore();
  const jd = makeJdRecord({ id: "jd-999", jdHash: "hash-xyz" });
  const tool = makeTool(makeJdReader(jd), store);

  await tool.execute("call-1", validParams);

  const entry = store.getLatest();
  assert.equal(entry?.report.jd.jdId, "jd-999");
  assert.equal(entry?.report.jd.jdHash, "hash-xyz");
});

test("tool result tier is based on computed finalScore", async () => {
  const store = new MatchReportStore();
  const highParams = {
    ...validParams,
    dimensions: [
      { dimension: "skills" as const, score: 95, rationale: "excellent" },
      { dimension: "experience" as const, score: 95, rationale: "excellent" },
      { dimension: "education" as const, score: 95, rationale: "excellent" },
      { dimension: "overallImpression" as const, score: 95, rationale: "excellent" },
    ],
  };
  const tool = makeTool(makeJdReader(), store);

  const result = await tool.execute("call-1", highParams);

  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  const summary = JSON.parse(text) as { tier: string };
  assert.equal(summary.tier, "excellent");
});

test("tool uses usedExperiences to populate experience references", async () => {
  const store = new MatchReportStore();
  const tool = makeTool(makeJdReader(), store);

  await tool.execute("call-1", validParams);

  const entry = store.getLatest();
  assert.equal(entry?.report.experiences.length, 1);
  assert.equal(entry?.report.experiences[0]?.experienceId, "exp-1");
});

test("host clamps inflated coverage and evidence completeness claims", async () => {
  const store = new MatchReportStore();
  const tool = makeTool(makeJdReader(), store);
  const inflated = {
    ...validParams,
    coverageRatio: 1,
    evidenceCompleteness: 1,
  };
  await tool.execute("call-1", inflated);
  const entry = store.getLatest();
  // JD has 2 requirements; validParams highlights only req-2 → coverage 0.5
  assert.equal(entry?.report.coverageRatio, 0.5);
  assert.equal(entry?.report.evidenceCompleteness, 1);
});

test("host records local model id and scorer version 1.1", async () => {
  const store = new MatchReportStore();
  const tool = createPrepareMatchAnalysisTool(
    makeJdReader(),
    makeExperienceReader(),
    store,
    { modelId: "deepseek-chat" },
  );
  await tool.execute("call-1", validParams);
  const entry = store.getLatest();
  assert.equal(entry?.report.meta.modelId, "deepseek-chat");
  assert.equal(entry?.report.meta.scorerVersion, "1.1");
});

test("tool summary reminds score is not a hiring probability", async () => {
  const store = new MatchReportStore();
  const tool = makeTool(makeJdReader(), store);
  const result = await tool.execute("call-1", validParams);
  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  const summary = JSON.parse(text) as { disclaimer: string; instruction: string };
  assert.match(summary.disclaimer, /非录用概率/u);
  assert.match(summary.instruction, /非录用概率/u);
});
