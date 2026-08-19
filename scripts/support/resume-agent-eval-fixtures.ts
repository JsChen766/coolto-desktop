import type {
  ExperienceDetail,
  JdRecord,
  UserProfile,
} from "../../src/api/types.js";
import { ResumeSourceSnapshotBuilder } from "../../src/resume/source-snapshot.js";

export interface SemanticEvalCase {
  id: string;
  language: "zh-CN" | "en-US";
  jd: JdRecord;
  experiences: ExperienceDetail[];
  expectedStatus: "ready_for_approval" | "needs_user_decision";
  forbiddenTerms: string[];
  /** 素材数学不可达时门禁拒绝创建 workspace，模型应追问用户补充材料。 */
  expectsNoWorkspace?: boolean;
}

export function createSemanticEvalBuilder(
  evalCase: SemanticEvalCase,
): ResumeSourceSnapshotBuilder {
  const byId = new Map(
    evalCase.experiences.map((experience) => [experience.id, experience]),
  );
  return new ResumeSourceSnapshotBuilder(
    {
      currentUser: {
        getCurrentUser: async () => ({
          id: `user-${evalCase.id}`,
          email: `${evalCase.id}@example.com`,
        }),
      },
      profile: { getUserProfile: async () => profile(evalCase) },
      jd: {
        listJds: async () => ({ items: [evalCase.jd], nextCursor: null }),
        getJd: async () => evalCase.jd,
      },
      experience: {
        searchExperiences: async () => ({
          items: evalCase.experiences,
          nextCursor: null,
        }),
        getExperience: async (id) => {
          const experience = byId.get(id);
          if (!experience) throw new Error(`Unknown eval experience ${id}`);
          return structuredClone(experience);
        },
      },
    },
    { now: () => new Date("2026-07-23T00:00:00.000Z") },
  );
}

export function semanticEvalCases(): SemanticEvalCase[] {
  return [chineseCase(), englishCase(), missingSourceCase()];
}

function chineseCase(): SemanticEvalCase {
  return {
    id: "semantic-zh",
    language: "zh-CN",
    jd: jd("jd-zh", [
      requirement("req-python", "使用 Python 处理业务数据", ["Python"]),
      requirement("req-report", "建立可复用的数据报表", ["报表"]),
    ]),
    experiences: [
      experience("edu-zh", "education", "示例大学", "主修信息系统与数据分析。"),
      experience(
        "work-zh",
        "work",
        "数据分析实习生",
        "使用 Python 清洗运营数据并建立异常检查规则。为 3 个业务团队建立周度报表并统一指标口径。与产品和运营团队核对字段定义并记录修改来源。整理问题台账并跟进每项问题的处理状态。",
        ["Python", "数据分析"],
      ),
    ],
    expectedStatus: "ready_for_approval",
    forbiddenTerms: ["50%", "收入", "主导"],
  };
}

function englishCase(): SemanticEvalCase {
  return {
    id: "semantic-en",
    language: "en-US",
    jd: jd("jd-en", [
      requirement("req-sql", "Use SQL for product analytics", ["SQL"]),
      requirement("req-test", "Create repeatable regression tests", ["regression"]),
    ]),
    experiences: [
      experience(
        "edu-en",
        "education",
        "Example University",
        "Studied information systems and product analytics.",
      ),
      experience(
        "work-en",
        "work",
        "Product Analytics Intern",
        "Used SQL to clean product event data and document metric definitions. Built a weekly funnel report for two product teams and recorded data refresh issues. Partnered with product managers to verify dashboard figures against source tables.",
        ["SQL", "Product Analytics"],
      ),
      experience(
        "project-en",
        "project",
        "Document Regression Harness",
        "Created a repeatable regression suite for English, Chinese, and mixed-language documents. Linked each failure to an input sample and reproducible validation step.",
        ["Regression Testing"],
      ),
    ],
    expectedStatus: "ready_for_approval",
    forbiddenTerms: ["30%", "revenue", "spearheaded"],
  };
}

function missingSourceCase(): SemanticEvalCase {
  return {
    id: "semantic-missing",
    language: "zh-CN",
    jd: jd("jd-missing", [
      requirement("req-k8s", "Kubernetes 生产环境运维经验", ["Kubernetes"]),
    ]),
    experiences: [
      experience("edu-missing", "education", "示例大学", "主修信息管理。"),
      experience(
        "work-missing",
        "work",
        "运营实习生",
        "整理用户反馈并维护问题台账。制作每周运营数据汇总并核对来源文件。与产品团队同步问题状态和后续负责人。",
        ["运营分析"],
      ),
    ],
    expectedStatus: "needs_user_decision",
    forbiddenTerms: ["Kubernetes", "容器", "集群"],
    expectsNoWorkspace: true,
  };
}

function profile(evalCase: SemanticEvalCase): UserProfile {
  return {
    fullName: evalCase.language === "zh-CN" ? "语义评测" : "Semantic Eval",
    contactEmail: `${evalCase.id}@example.com`,
    email: `${evalCase.id}@example.com`,
    phone: "+852 1234 5678",
    location: evalCase.language === "zh-CN" ? "香港" : "Hong Kong",
    linkedinUrl: null,
    githubUrl: null,
    personalWebsite: null,
    currentTitle: null,
    currentCompany: null,
    yearsOfExperience: 1,
    careerStage: "early_career",
    targetRoles: [],
    targetIndustries: [],
    targetLocations: [],
    preferredLanguage: evalCase.language,
    resumeStyle: "standard",
  };
}

function jd(id: string, requirements: JdRecord["requirements"]): JdRecord {
  return {
    id,
    title: "Semantic Evaluation Role",
    company: "Evaluation Only",
    targetRole: "Product Analyst",
    rawText: requirements.map((item) => item.text).join("\n"),
    requirements,
    jdHash: `hash-${id}`,
    requirementMapId: `map-${id}`,
    requirementsOrigin: "eval",
    sourceThreadId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
  };
}

function requirement(id: string, text: string, keywords: string[]) {
  return {
    id,
    text,
    category: "technical",
    importance: "high" as const,
    keywords,
    weight: 1,
    v2Importance: "must_have" as const,
    v2Category: "technical",
  };
}

function experience(
  id: string,
  category: "education" | "work" | "project",
  title: string,
  content: string,
  tags: string[] = [],
): ExperienceDetail {
  const revision = {
    id: `revision-${id}`,
    experienceId: id,
    content,
    source: "manual",
    revisionHash: `hash-${id}`,
    factBankStatus: "ready",
    createdAt: "2026-07-01T00:00:00Z",
  };
  return {
    id,
    category,
    title,
    organization: category === "education" ? "Information Systems" : "Example",
    role: category === "education" ? "Bachelor" : "Evaluation Team",
    location: "Hong Kong",
    startDate: "2025-01",
    endDate: "2025-06",
    tags,
    status: "active",
    deletedAt: null,
    entityVersion: 1,
    currentRevisionId: revision.id,
    currentRevision: revision,
    revisions: [revision],
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
  };
}
