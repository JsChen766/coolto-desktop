import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ExperienceReader, JdReader } from "../api/types.js";
import { validateMatchExperienceReferences } from "../match/experience-evidence-validator.js";
import type { MatchReportExperienceReference, MatchGap, MatchHighlight } from "../match/types.js";
import { buildMatchReport } from "../match/report-builder.js";
import { MatchReportStore } from "../match/report-store.js";
import { scoreToTier } from "../match/scorer.js";
import type { DimensionInput } from "../match/scorer.js";

const dimensionKeySchema = Type.Union([
  Type.Literal("skills"),
  Type.Literal("experience"),
  Type.Literal("education"),
  Type.Literal("overallImpression"),
]);

const severitySchema = Type.Union([
  Type.Literal("must_have"),
  Type.Literal("preferred"),
  Type.Literal("optional"),
]);

const evidenceSchema = Type.Object({
  experienceId: Type.String({ minLength: 1 }),
  revisionId: Type.String({ minLength: 1 }),
  revisionContentHash: Type.String({ minLength: 1 }),
  sourceQuote: Type.String({ minLength: 1, maxLength: 1000 }),
});

const dimensionSchema = Type.Object({
  dimension: dimensionKeySchema,
  score: Type.Number({ minimum: 0, maximum: 100 }),
  rationale: Type.String({ minLength: 1, maxLength: 500 }),
});

const highlightSchema = Type.Object({
  requirementId: Type.String({ minLength: 1 }),
  requirementText: Type.String({ minLength: 1, maxLength: 1000 }),
  summary: Type.String({ minLength: 1, maxLength: 500 }),
  evidence: Type.Array(evidenceSchema, { minItems: 1, maxItems: 10 }),
});

const gapSchema = Type.Object({
  requirementId: Type.String({ minLength: 1 }),
  requirementText: Type.String({ minLength: 1, maxLength: 1000 }),
  severity: severitySchema,
  explanation: Type.String({ minLength: 1, maxLength: 500 }),
  suggestion: Type.String({ minLength: 1, maxLength: 500 }),
});

const usedExperienceSchema = Type.Object({
  experienceId: Type.String({ minLength: 1 }),
  revisionId: Type.String({ minLength: 1 }),
  contentHash: Type.String({ minLength: 1 }),
});

const parameters = Type.Object({
  jdId: Type.String({
    minLength: 1,
    description: "目标 JD 的 ID，必须来自已保存的 JD（search_jds / get_jd 返回值）。",
  }),
  dimensions: Type.Array(dimensionSchema, {
    minItems: 4,
    maxItems: 4,
    description: "必须包含全部 4 个维度：skills、experience、education、overallImpression。分数 0–100，必须如实评分，不得虚高。",
  }),
  highlights: Type.Array(highlightSchema, {
    minItems: 0,
    maxItems: 20,
    description: "强匹配项，每条必须有至少一条原文引用证据。没有满足的要求时传空数组。",
  }),
  gaps: Type.Array(gapSchema, {
    minItems: 0,
    maxItems: 20,
    description: "未满足或不足的岗位要求。没有缺口时传空数组。",
  }),
  usedExperiences: Type.Array(usedExperienceSchema, {
    minItems: 0,
    maxItems: 50,
    description: "本次分析中读取过的经历 ID 和版本，用于失效检测。",
  }),
  coverageRatio: Type.Number({
    minimum: 0,
    maximum: 1,
    description: "岗位要求覆盖比例（0–1）。highlights 覆盖了多少条要求。",
  }),
  evidenceCompleteness: Type.Number({
    minimum: 0,
    maximum: 1,
    description: "证据完整度（0–1）。能提供原文引用的亮点占比。",
  }),
});

export function createPrepareMatchAnalysisTool(
  jdReader: JdReader,
  experienceReader: ExperienceReader,
  matchReportStore: MatchReportStore,
): AgentTool<typeof parameters> {
  return {
    name: "prepare_match_analysis",
    label: "生成匹配分析报告",
    description:
      "用户要求将简历与 JD 比对时调用。必须先用 get_jd 确认 jdId，并用 get_experience 读取相关经历后再调用本工具。" +
      "所有 highlights 必须有原文引用，不得编造。分数须如实评分，不得虚高。",
    parameters,
    execute: async (_toolCallId, params, signal) => {
      const jd = await jdReader.getJd(params.jdId, signal);

      const jdRef = {
        jdId: jd.id,
        jdHash: jd.jdHash,
        requirementIds: jd.requirements.map((r) => r.id),
      };

      const experienceRefs: MatchReportExperienceReference[] =
        params.usedExperiences.map((e) => ({
          experienceId: e.experienceId,
          revisionId: e.revisionId,
          contentHash: e.contentHash,
        }));
      await validateMatchExperienceReferences(
        experienceReader,
        experienceRefs,
        signal,
      );

      const dimensionInputs: DimensionInput[] = params.dimensions.map((d) => ({
        dimension: d.dimension,
        score: d.score,
        rationale: d.rationale,
      }));

      const highlights: MatchHighlight[] = params.highlights.map((h) => ({
        requirementId: h.requirementId,
        requirementText: h.requirementText,
        summary: h.summary,
        evidence: h.evidence.map((ev) => ({
          experienceId: ev.experienceId,
          revisionId: ev.revisionId,
          revisionContentHash: ev.revisionContentHash,
          sourceQuote: ev.sourceQuote,
        })),
      }));

      const gaps: MatchGap[] = params.gaps.map((g) => ({
        requirementId: g.requirementId,
        requirementText: g.requirementText,
        severity: g.severity,
        explanation: g.explanation,
        suggestion: g.suggestion,
      }));

      const report = buildMatchReport(
        {
          dimensions: dimensionInputs,
          highlights,
          gaps,
          coverageRatio: params.coverageRatio,
          evidenceCompleteness: params.evidenceCompleteness,
        },
        jdRef,
        experienceRefs,
        {
          modelId: "claude-sonnet-4-6",
          scorerVersion: "1.0",
          generatedAt: new Date().toISOString(),
        },
      );

      matchReportStore.add(report, jd.title, jd.company);

      const summary = {
        reportId: report.id,
        jdTitle: jd.title,
        jdCompany: jd.company,
        finalScore: report.finalScore,
        tier: scoreToTier(report.finalScore),
        highlightsCount: report.highlights.length,
        gapsCount: report.gaps.length,
        coverageRatio: report.coverageRatio,
        instruction:
          "宿主已收到匹配报告并渲染卡片。请用 1–2 句话概括主要结论，不要重复罗列所有亮点和缺口。",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary) }],
        details: summary,
      };
    },
  };
}
