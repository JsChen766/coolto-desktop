import type { JdArtifactData, MatchReportArtifactData } from "@desktop/types";

export function createDemoMatchReport(): MatchReportArtifactData {
  return {
    reportId: `match-report-${crypto.randomUUID()}`,
    jdId: "demo-jd-001",
    jdTitle: "高级前端工程师",
    jdCompany: "字节跳动",
    finalScore: 78,
    tier: "good",
    dimensions: [
      { dimension: "skills", score: 85, weight: 0.4, rationale: "React/Vue/TypeScript 均有项目经验" },
      { dimension: "experience", score: 70, weight: 0.35, rationale: "有 3 年经验，岗位要求 5 年" },
      { dimension: "education", score: 80, weight: 0.15, rationale: "计算机本科符合要求" },
      { dimension: "overallImpression", score: 75, weight: 0.1, rationale: "有大型项目背景，沟通能力待核实" },
    ],
    highlights: [
      {
        requirementId: "req-1",
        requirementText: "精通 React/Vue 等主流框架",
        summary: "简历显示主导了多个 React 项目，有完整的组件库建设经验",
        evidence: [{
          experienceId: "exp-1",
          revisionId: "rev-1",
          revisionContentHash: "abc",
          sourceQuote: "主导建设组件库，覆盖 30+ 组件，被 3 个产品线复用",
        }],
      },
      {
        requirementId: "req-2",
        requirementText: "熟悉 TypeScript",
        summary: "项目全面使用 TypeScript，有类型体操经验",
        evidence: [{
          experienceId: "exp-1",
          revisionId: "rev-1",
          revisionContentHash: "abc",
          sourceQuote: "全面引入 TypeScript 严格模式，消灭运行时类型错误",
        }],
      },
    ],
    gaps: [
      {
        requirementId: "req-0",
        requirementText: "5年以上前端开发经验",
        severity: "must_have",
        explanation: "候选人有约 3 年经验，低于岗位要求的 5 年",
        suggestion: "可补充实习或兼职项目以弥补年限差距",
      },
      {
        requirementId: "req-4",
        requirementText: "有性能优化经验者优先",
        severity: "preferred",
        explanation: "简历未提及明确的性能优化成果或指标",
        suggestion: "可增加性能优化相关经历，附数据指标更佳",
      },
    ],
    coverageRatio: 0.67,
    evidenceCompleteness: 0.85,
    generatedAt: new Date().toISOString(),
    expired: false,
  };
}

export function createDemoJdArtifact(): JdArtifactData {
  return {
    proposalId: `jd-proposal-${crypto.randomUUID()}`,
    approvalRequestId: `approval-${crypto.randomUUID()}`,
    title: "高级前端工程师",
    company: "字节跳动",
    targetRole: null,
    requirements: [
      { text: "5年以上前端开发经验", category: "experience", importance: "high" },
      { text: "精通 React/Vue 等主流框架", category: "skill", importance: "high" },
      { text: "熟悉 TypeScript，有大型项目经验", category: "skill", importance: "high" },
      { text: "良好的沟通能力和团队协作精神", category: "skill", importance: "medium" },
      { text: "有性能优化经验者优先", category: "experience", importance: "medium" },
      { text: "计算机相关专业本科及以上学历", category: "education", importance: "high" },
    ],
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}
