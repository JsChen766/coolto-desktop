import type {
  ExperienceDetail,
  ExperienceReader,
  JdReader,
  JdRecord,
  UserProfile,
  UserProfileReader,
} from "../../src/api/types.js";
import { ResumeSourceSnapshotBuilder } from "../../src/resume/source-snapshot.js";

export interface ManyExperiencesReaders {
  currentUser: { getCurrentUser: () => Promise<{ id: string; email: string }> };
  profile: UserProfileReader;
  jd: JdReader;
  experience: ExperienceReader;
}

/**
 * 贴近真实用户的经历形态：5 条经历、17 条可写证据（投资研究 7、OSL BD 3、
 * 增长运营 5、CUHK 硕士 1、ZJU 本科 1）。
 */
export function createManyExperiencesFixture(): {
  readers: ManyExperiencesReaders;
  builder: ResumeSourceSnapshotBuilder;
} {
  const experiences = [
    createExperience(
      "edu-cuhk",
      "education",
      "香港中文大学",
      "主修金融学硕士课程，研究方向为资产定价与行为金融，GPA 3.7/4.0。",
      ["金融"],
    ),
    createExperience(
      "edu-zju",
      "education",
      "浙江大学",
      "主修金融学学士，辅修计算机科学。",
      ["金融"],
    ),
    createExperience(
      "work-inv",
      "work",
      "投资研究助理",
      "搭建 DCF 与可比公司估值模型覆盖 12 家上市公司，输出投资备忘录与评级建议，并在季度复盘中持续修正模型假设与敏感性区间。完成半导体与消费行业深度研究，撰写 60 页行业报告并输出产业链图谱与竞争格局结论。建立行业数据库跟踪龙头公司季度财报与估值变化，维护宏观与利率跟踪表并输出周度策略要点。参与 IPO 与再融资项目分析，整理发行定价资料并协助完成路演材料与机构问答准备。整理机构调研纪要并提炼投资要点，供投资委员会决策参考并沉淀会议行动项。搭建估值敏感性分析模板，统一团队模型口径并建立财务数据校验清单。",
      ["估值建模", "行业研究"],
    ),
    createExperience(
      "work-osl",
      "work",
      "OSL 商务拓展助理",
      "参与数字资产交易所机构客户商务拓展，梳理潜在客户名单并建立合作推进台账。协助撰写机构合作方案与产品介绍材料，配合完成客户演示与问题跟进。整理行业合规政策动态并更新竞品对比信息。",
      ["商务拓展"],
    ),
    createExperience(
      "work-growth",
      "work",
      "增长与社区运营助理",
      "负责海外社区日常运营与内容发布，建立内容日历并提升用户活跃度。策划增长活动并落地执行，跟踪活动数据并输出复盘报告。搭建用户反馈收集机制并推动产品改进项落地。维护合作渠道关系并支持获客活动的资源协调。分析用户行为数据并输出增长建议供团队决策。",
      ["社区运营", "用户增长"],
    ),
  ];
  const byId = new Map(experiences.map((experience) => [experience.id, experience]));
  const readers: ManyExperiencesReaders = {
    currentUser: {
      getCurrentUser: async () => ({
        id: "user-debug",
        email: "debug@example.com",
      }),
    },
    profile: { getUserProfile: async () => createProfile() },
    jd: {
      listJds: async () => ({ items: [createJd()], nextCursor: null }),
      getJd: async () => createJd(),
    },
    experience: {
      searchExperiences: async () => ({ items: experiences, nextCursor: null }),
      getExperience: async (id) => {
        const experience = byId.get(id);
        if (!experience) throw new Error(`Unknown debug experience ${id}`);
        return structuredClone(experience);
      },
    },
  };
  return {
    readers,
    builder: new ResumeSourceSnapshotBuilder(
      readers,
      { now: () => new Date("2026-08-17T00:00:00.000Z") },
    ),
  };
}

function createJd(): JdRecord {
  return {
    id: "jd-strategy",
    title: "战略发展部实习生",
    company: "Example",
    targetRole: "战略研究",
    rawText: "需要行业研究、战略分析与数据分析经验，熟悉金融与科技行业优先。",
    requirements: [
      {
        id: "req-strategy",
        text: "行业研究与战略分析能力",
        category: "domain",
        importance: "high",
        keywords: ["行业研究", "战略"],
        weight: 0.9,
        v2Importance: "must_have",
        v2Category: "domain",
      },
      {
        id: "req-finance",
        text: "财务或投资分析经验",
        category: "domain",
        importance: "high",
        keywords: ["财务", "投资"],
        weight: 0.8,
        v2Importance: "must_have",
        v2Category: "domain",
      },
    ],
    jdHash: "debug-jd-hash",
    requirementMapId: "map-debug",
    requirementsOrigin: "parsed",
    sourceThreadId: null,
    entityVersion: 1,
    deletedAt: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-02T00:00:00Z",
  };
}

function createProfile(): UserProfile {
  return {
    fullName: "Debug User",
    contactEmail: "debug@example.com",
    email: "debug@example.com",
    phone: "+852 0000 0000",
    location: "Hong Kong",
    linkedinUrl: null,
    githubUrl: null,
    personalWebsite: null,
    currentTitle: null,
    currentCompany: null,
    yearsOfExperience: 2,
    careerStage: "early_career",
    targetRoles: [],
    targetIndustries: [],
    targetLocations: [],
    preferredLanguage: "zh-CN",
    resumeStyle: "standard",
  };
}

const START_DATES: Record<string, string> = {
  "edu-cuhk": "2023-09",
  "edu-zju": "2019-09",
  "work-inv": "2024-06",
  "work-osl": "2023-06",
  "work-growth": "2023-03",
};

function startDateFor(id: string): string {
  return START_DATES[id] ?? "2024-06";
}

function createExperience(
  id: string,
  category: "education" | "work" | "project",
  title: string,
  content: string,
  tags: string[] = [],
): ExperienceDetail {
  const revision = {
    id: `rev-${id}`,
    experienceId: id,
    content,
    source: "manual" as const,
    revisionHash: `hash-${id}`,
    factBankStatus: "ready" as const,
    createdAt: "2026-08-01T00:00:00Z",
  };
  return {
    id,
    category,
    title,
    organization: category === "education" ? "香港中文大学" : "Example Corp",
    role: title,
    location: "香港",
    startDate: startDateFor(id),
    endDate: "2026-06",
    tags,
    status: "active",
    currentRevisionId: revision.id,
    currentRevision: revision,
    entityVersion: 1,
    deletedAt: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-02T00:00:00Z",
    revisions: [revision],
  };
}
