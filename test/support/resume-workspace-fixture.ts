import type {
  ExperienceDetail,
  JdRecord,
  UserProfile,
} from "../../src/api/types.js";
import type {
  ResumeCompileResult,
  ResumeCompileViolation,
} from "../../src/resume/compiler-types.js";
import { ResumeSourceSnapshotBuilder } from "../../src/resume/source-snapshot.js";
import type {
  ResumeSourceSnapshot,
} from "../../src/resume/source-types.js";
import type { ResumeStructure } from "../../src/resume/types.js";
import type { ResumeCompiler } from "../../src/resume/workspace/compiler-port.js";
import { allEvidenceCandidates } from "../../src/resume/quality/evidence-candidates.js";
import type { EvidenceBindingInput } from "../../src/resume/workspace/types.js";

export const WORK_CONTENT =
  "使用 Python 清洗运营数据产品。为 3 个团队建立周度报表。设计异常检查规则并与业务团队协作。";

export function createWorkspaceSnapshotBuilder(
  options: {
    includeEducation?: boolean;
    jdRequirements?: JdRecord["requirements"];
    educationContent?: string;
    workContent?: string;
    tinyWorkContent?: string;
  } = {},
): ResumeSourceSnapshotBuilder {
  const experiences = [
    createEducation(options.educationContent), createWork(options.workContent),
    createTinyWork(options.tinyWorkContent), createSkills(),
    createLegacySkills(),
  ].filter((experience) => options.includeEducation !== false || experience.category !== "education");
  const jd = createJd(options.jdRequirements);
  const byId = new Map(experiences.map((experience) => [experience.id, experience]));
  return new ResumeSourceSnapshotBuilder(
    {
      currentUser: {
        getCurrentUser: async () => ({ id: "user-1", email: "alice@example.com" }),
      },
      profile: { getUserProfile: async () => createProfile() },
      jd: {
        listJds: async () => ({ items: [jd], nextCursor: null }),
        getJd: async () => structuredClone(jd),
      },
      experience: {
        searchExperiences: async () => ({ items: experiences, nextCursor: null }),
        getExperience: async (id) => {
          const experience = byId.get(id);
          if (!experience) throw new Error(`Unknown fixture experience ${id}`);
          return structuredClone(experience);
        },
      },
    },
    { now: () => new Date("2026-07-23T00:00:00.000Z") },
  );
}

export class FixtureResumeCompiler implements ResumeCompiler {
  public readonly structures: ResumeStructure[] = [];

  public async compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    this.structures.push(structuredClone(structure));
    const bullets = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets),
    );
    const usageRatio = Math.min(1.05, 0.72 + bullets.length * 0.14);
    const violations: ResumeCompileViolation[] = [];
    if (usageRatio < 0.92) {
      violations.push({ code: "page_underfilled", message: "Page is underfilled." });
    }
    for (const bullet of bullets.filter((candidate) =>
      candidate.text.endsWith("短尾"),
    )) {
      violations.push({
        code: "bullet_tail_too_short",
        message: "Bullet tail is too short.",
        bulletId: bullet.id,
      });
    }
    if (usageRatio > 1) {
      violations.push({ code: "page_overflow", message: "Page overflowed." });
    }
    return {
      templateId: "resume-standard",
      profileVersion: "resume-standard/v1",
      profileHash: "sha256:fixture",
      qualified: violations.length === 0,
      fontsReady: true,
      loadedFontFamilies: ["SimSun", "Times New Roman"],
      observedAt: "2026-07-24T00:00:00.000Z",
      viewport: { widthPx: 1280, heightPx: 900, devicePixelRatio: 1 },
      pageCount: usageRatio > 1 ? 2 : 1,
      overflowPx: usageRatio > 1 ? 20 : 0,
      usedHeightPx: usageRatio * 1000,
      availableHeightPx: 1000,
      bodyLineHeightPx: 20,
      bodyFontSizePx: 13,
      usageRatio,
      effectiveTargetBand: { minimum: 0.92, target: 0.95, maximum: 0.98 },
      bullets: bullets.map((bullet) => ({
        bulletId: bullet.id,
        lineCount: bullet.text.includes("增加一行") ? 3 : 2,
        lastLineWidthPx: bullet.text.endsWith("短尾") ? 200 : 480,
        availableLineWidthPx: 600,
        lastLineRatio: bullet.text.endsWith("短尾") ? 1 / 3 : 0.8,
        passed: !bullet.text.endsWith("短尾"),
      })),
      violations,
    };
  }
}

export function createBinding(
  snapshot: ResumeSourceSnapshot,
  bulletId: string,
  sourceQuote: string,
  bulletText = sourceQuote,
): EvidenceBindingInput {
  const experience = snapshot.experiences.find(({ id }) => id === "work-1")!;
  const candidate = allEvidenceCandidates(snapshot).find(
    (item) =>
      item.experienceId === experience.id && item.sourceQuote === sourceQuote,
  );
  if (!candidate) throw new Error(`Missing evidence candidate: ${sourceQuote}`);
  void bulletId;
  return {
    bulletText,
    evidenceIds: [candidate.evidenceId],
  };
}

function createProfile(): UserProfile {
  return {
    fullName: "Alice Chen",
    contactEmail: "resume@example.com",
    email: "alice@example.com",
    phone: "+852 1234 5678",
    location: "Hong Kong",
    linkedinUrl: "https://linkedin.com/in/alice",
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

function createJd(requirements?: JdRecord["requirements"]): JdRecord {
  return {
    id: "jd-1",
    title: "数据产品经理",
    company: "Example",
    targetRole: "产品经理",
    rawText: "需要数据产品经验和跨团队协作能力。",
    requirements: requirements ?? [
      {
        id: "req-1",
        text: "具备数据产品经验",
        category: "domain",
        importance: "high",
        keywords: ["数据产品"],
        weight: 0.9,
        v2Importance: "must_have",
        v2Category: "domain",
      },
    ],
    jdHash: "server-jd-hash",
    requirementMapId: "map-1",
    requirementsOrigin: "parsed",
    sourceThreadId: null,
    entityVersion: 1,
    deletedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
  };
}

function createEducation(content = "主修信息系统与数据分析。"): ExperienceDetail {
  return createExperience({
    id: "edu-1",
    revisionId: "rev-edu-1",
    category: "education",
    title: "香港示例大学",
    organization: "信息系统专业",
    role: "学士",
    content,
    tags: ["数据分析"],
  });
}

function createWork(content = WORK_CONTENT): ExperienceDetail {
  return createExperience({
    id: "work-1",
    revisionId: "rev-work-1",
    category: "work",
    title: "数据分析实习生",
    organization: "Example",
    role: "数据团队",
    content,
    tags: ["Python", "数据分析"],
  });
}

/** 单句短素材：用于写作前门禁的"物理不可达"回归样本。 */
function createTinyWork(content = "负责日常数据整理。"): ExperienceDetail {
  return createExperience({
    id: "tiny-work-1",
    revisionId: "rev-tiny-work-1",
    category: "work",
    title: "数据助理",
    organization: "Tiny Corp",
    role: "成员",
    content,
    tags: ["数据分析"],
  });
}

function createSkills(): ExperienceDetail {
  return createExperience({
    id: "skills-1",
    revisionId: "rev-skills-1",
    category: "other",
    title: "语言与技能",
    organization: "",
    role: "",
    content: "熟练使用 Python 与 SQL，英语可作为工作语言。",
    tags: ["Python", "SQL", "英语"],
    resumeSectionKey: "skills",
    resumeSectionLabel: "专业技能",
  });
}

function createLegacySkills(): ExperienceDetail {
  return createExperience({
    id: "legacy-skills-1",
    revisionId: "rev-legacy-skills-1",
    category: "other",
    title: "语言与技能",
    organization: "",
    role: "",
    content: "英语可作为工作语言，熟练使用 Excel、SQL 与 Python。",
    tags: ["英语", "Excel", "SQL", "Python"],
  });
}

function createExperience(input: {
  id: string;
  revisionId: string;
  category: "education" | "work" | "other";
  title: string;
  organization: string;
  role: string;
  content: string;
  tags: string[];
  resumeSectionKey?: string;
  resumeSectionLabel?: string;
}): ExperienceDetail {
  const revision = {
    id: input.revisionId,
    experienceId: input.id,
    content: input.content,
    source: "manual",
    revisionHash: `hash-${input.revisionId}`,
    factBankStatus: "ready",
    createdAt: "2026-07-01T00:00:00Z",
  };
  return {
    id: input.id,
    category: input.category,
    title: input.title,
    organization: input.organization,
    role: input.role,
    location: "香港",
    startDate: "2022-09",
    endDate: "2026-06",
    tags: input.tags,
    resumeSectionKey: input.resumeSectionKey ?? null,
    resumeSectionLabel: input.resumeSectionLabel ?? null,
    status: "active",
    currentRevisionId: revision.id,
    currentRevision: revision,
    entityVersion: 1,
    deletedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
    revisions: [revision],
  };
}
