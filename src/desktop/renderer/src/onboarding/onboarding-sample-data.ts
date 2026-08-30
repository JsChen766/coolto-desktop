import type {
  ApplicationRecord,
  ExperienceDetail,
  ProfileContactView,
  ResumeDraftDetail,
  ResumeLibraryEntry,
} from "../../../shared/types.js";
import type { JdRecord } from "../../../../api/types.js";
import { createOnboardingSampleResume } from "./onboarding-sample-resume.js";

export const SAMPLE_JD_ID = "019fb000-0000-7000-8000-000000000101";
export const SAMPLE_RESUME_ID = "019fb000-0000-7000-8000-000000000201";
export const SAMPLE_DRAFT_ID = "019fb000-0000-7000-8000-000000000202";
export const SAMPLE_APPLICATION_ID = "019fb000-0000-7000-8000-000000000301";

export function sampleProfile(): ProfileContactView {
  return {
    fullName: "林小满（示例）",
    phone: "+852 5555 0108",
    contactEmail: "demo@coolto.example",
    email: null,
    location: "Hong Kong",
    linkedinUrl: null,
    githubUrl: null,
    personalWebsite: null,
    currentTitle: "数据分析实习生",
    currentCompany: "Orbit Commerce",
    yearsOfExperience: 1,
    careerStage: "early_career",
    targetRoles: ["数据分析师"],
    targetIndustries: ["互联网"],
    targetLocations: ["Hong Kong"],
    preferredLanguage: "zh-CN",
    resumeStyle: null,
    syncStatus: "clean",
  };
}

export function sampleExperiences(now = new Date()): ExperienceDetail[] {
  return [
    experience(now, 1, "work", "增长分析实习（示例）", "Orbit Commerce（示例）", "Growth Analytics Intern",
      "搭建新用户激活漏斗看板，分析 4 个关键步骤的流失；设计两轮 A/B 实验，脱敏示例结果为激活率提升 12%。",
      "2025-03", "2025-08", ["增长分析", "A/B 测试"]),
    experience(now, 2, "project", "用户研究项目（示例）", "City Data Lab（示例）", "项目成员",
      "整理 18 份脱敏访谈记录与行为数据，归纳关键使用障碍并输出产品改进建议。",
      "2024-09", "2025-01", ["用户研究", "数据分析"]),
    experience(now, 3, "education", "商业分析本科（示例）", "Harbour University（示例）", "学生",
      "示例课程：统计学、数据库系统、实验设计、商业智能。所有学校与课程信息均为虚构。",
      "2021-09", "2025-06", ["教育"]),
  ];
}

export function sampleJd(now = new Date()): JdRecord {
  const timestamp = now.toISOString();
  const requirement = (id: number, text: string, category: string) => ({
    id: `019fb000-0000-7000-8100-0000000001${id}`,
    text, category, importance: "high" as const, keywords: [], weight: null,
    v2Importance: "must_have" as const, v2Category: category,
  });
  return {
    id: SAMPLE_JD_ID,
    title: "数据分析师 · Nova Labs（示例）",
    company: "Nova Labs（示例）",
    targetRole: "数据分析师",
    rawText: "负责 SQL 数据建模、指标体系、实验分析和跨团队业务沟通。本 JD 完全虚构。",
    requirements: [
      requirement(1, "熟练使用 SQL 并理解数据建模", "technology"),
      requirement(2, "能够设计指标体系和分析实验结果", "responsibility"),
      requirement(3, "能够与产品及业务团队沟通", "soft_skill"),
    ],
    jdHash: null, requirementMapId: null, requirementsOrigin: "app_extracted",
    sourceThreadId: null, createdAt: timestamp, updatedAt: timestamp,
    entityVersion: 1, deletedAt: null, syncStatus: "clean",
  };
}

export function sampleDraft(now = new Date()): ResumeDraftDetail {
  const structure = createOnboardingSampleResume();
  const updatedAt = now.toISOString();
  const bullets = structure.sections.flatMap((section) =>
    section.items.flatMap((item) => item.bullets));
  return {
    artifactId: SAMPLE_DRAFT_ID,
    title: "Nova Labs 数据分析师岗位简历（示例）",
    jdId: SAMPLE_JD_ID,
    jdTitle: "数据分析师 · Nova Labs（示例）",
    targetRole: "数据分析师",
    conversationIds: [], updatedAt, checkpointCount: 1,
    hasPendingChange: false, generationStrategy: "tailored",
    generationReady: true, cloudState: "synced", revision: 1, structure,
    compileResult: {
      templateId: "resume-standard", profileVersion: structure.layout_profile_version,
      profileHash: structure.layout_profile_hash, qualified: true, fontsReady: true,
      loadedFontFamilies: ["SimSun", "Times New Roman"], observedAt: updatedAt,
      viewport: { widthPx: 1280, heightPx: 820, devicePixelRatio: 1 },
      pageCount: 1, overflowPx: 0, usedHeightPx: 930, availableHeightPx: 1000,
      bodyLineHeightPx: 15.34, bodyFontSizePx: 14, usageRatio: 0.93,
      effectiveTargetBand: { minimum: 0.92, target: 0.95, maximum: 0.98 },
      bullets: bullets.map((bullet) => ({
        bulletId: bullet.id, lineCount: 2, lastLineWidthPx: 480,
        availableLineWidthPx: 600, lastLineRatio: 0.8, passed: true,
      })),
      violations: [],
    },
    workspaceStatus: "ready_for_approval",
    quality: {
      pageUsageRatio: 0.93, minimumBulletTailRatio: 0.8,
      minimumBulletTailTargetRatio: 2 / 3, factIntegrity: "passed",
      jdCoverage: { covered: 3, total: 3, ratio: 1 },
    },
    generationReadiness: { ready: true, blockers: [], warnings: [] },
    checkpoints: [{
      id: "019fb000-0000-7000-8300-000000000001",
      label: "固定示例结果", reason: "generated", createdAt: updatedAt, revision: 1,
    }],
    pendingChange: null,
  };
}

export function sampleResumeEntry(draft: ResumeDraftDetail): ResumeLibraryEntry {
  return {
    entryId: `local:${draft.artifactId}`,
    displayTitle: draft.title,
    cloud: {
      resumeId: SAMPLE_RESUME_ID, title: draft.title, targetRole: draft.targetRole,
      jdId: SAMPLE_JD_ID, status: "active", contentHash: "a".repeat(64),
      updatedAt: draft.updatedAt,
    },
    local: {
      artifactId: draft.artifactId, title: draft.title, jdId: draft.jdId,
      jdTitle: draft.jdTitle, targetRole: draft.targetRole,
      updatedAt: draft.updatedAt, checkpointCount: draft.checkpoints.length,
      hasPendingChange: false, generationStrategy: "tailored", generationReady: true,
    },
    syncStatus: "synced",
    availableOperations: ["open", "export_pdf"],
  };
}

export function sampleApplication(now = new Date()): ApplicationRecord {
  const timestamp = now.toISOString();
  return {
    id: SAMPLE_APPLICATION_ID, jdId: SAMPLE_JD_ID, resumeId: SAMPLE_RESUME_ID,
    companyName: "Nova Labs（示例）", roleName: "数据分析师",
    jdTitleSnapshot: "数据分析师 · Nova Labs（示例）",
    resumeTitleSnapshot: "Nova Labs 数据分析师岗位简历（示例）",
    resumeContentHashSnapshot: "a".repeat(64), deliveryMethod: "form_fill",
    targetUrl: null, appliedAt: timestamp, status: "applied",
    pendingConfirmation: false, source: "browser", dedupeKey: "onboarding-demo",
    companyBusiness: "虚构的数据产品公司", roleSummary: "示例岗位",
    companyCulture: "示例信息", rejectionReason: null, entityVersion: 1,
    createdAt: timestamp, updatedAt: timestamp, deletedAt: null, syncStatus: "clean",
  };
}

function experience(
  now: Date, index: number, category: ExperienceDetail["category"], title: string,
  organization: string, role: string, content: string, startDate: string,
  endDate: string, tags: string[],
): ExperienceDetail {
  const id = `019fb000-0000-7000-8000-00000000000${index}`;
  const revision = {
    id: `019fb000-0000-7000-8200-00000000000${index}`, experienceId: id,
    content, source: "onboarding_sample", revisionHash: `sample-${index}`,
    factBankStatus: "not_applicable", createdAt: now.toISOString(),
  };
  return {
    id, category, title, organization, role, location: "Hong Kong",
    startDate, endDate, tags, status: "active", currentRevisionId: revision.id,
    currentRevision: revision, revisions: [revision], createdAt: now.toISOString(),
    updatedAt: now.toISOString(), entityVersion: 1, deletedAt: null, syncStatus: "clean",
  };
}
