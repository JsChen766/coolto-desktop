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
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
} from "../../src/resume/source-types.js";
import type { ResumeStructure } from "../../src/resume/types.js";
import type { ResumeCompiler } from "../../src/resume/workspace/compiler-port.js";

export const WORK_CONTENT =
  "使用 Python 清洗运营数据。为 3 个团队建立周度报表。设计异常检查规则并与业务团队协作。";

export function createWorkspaceSnapshotBuilder(): ResumeSourceSnapshotBuilder {
  const experiences = [createEducation(), createWork()];
  const byId = new Map(experiences.map((experience) => [experience.id, experience]));
  return new ResumeSourceSnapshotBuilder(
    {
      currentUser: {
        getCurrentUser: async () => ({ id: "user-1", email: "alice@example.com" }),
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
    const usageRatio = Math.min(1.05, 0.65 + bullets.length * 0.12);
    const violations: ResumeCompileViolation[] = [];
    if (usageRatio < 0.85) {
      violations.push({ code: "page_underfilled", message: "Page is underfilled." });
    }
    for (const bullet of bullets.filter((candidate) =>
      candidate.text.includes("短尾"),
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
      usageRatio,
      effectiveTargetBand: { minimum: 0.85, target: 0.92, maximum: 0.98 },
      bullets: bullets.map((bullet) => ({
        bulletId: bullet.id,
        lineCount: 2,
        lastLineWidthPx: bullet.text.includes("短尾") ? 200 : 480,
        availableLineWidthPx: 600,
        lastLineRatio: bullet.text.includes("短尾") ? 1 / 3 : 0.8,
        passed: !bullet.text.includes("短尾"),
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
): BulletEvidenceBinding {
  const experience = snapshot.experiences.find(({ id }) => id === "work-1")!;
  const sourceStart = experience.content.indexOf(sourceQuote);
  if (sourceStart < 0) throw new Error(`Missing source quote: ${sourceQuote}`);
  return {
    bulletId,
    sourceExperienceId: experience.id,
    bulletText,
    excerpts: [
      {
        experienceId: experience.id,
        revisionId: experience.revisionId,
        revisionContentHash: experience.contentHash,
        sourceStart,
        sourceEnd: sourceStart + sourceQuote.length,
        sourceQuote,
      },
    ],
    matchedRequirementIds: ["req-1"],
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

function createJd(): JdRecord {
  return {
    id: "jd-1",
    title: "数据产品经理",
    company: "Example",
    targetRole: "产品经理",
    rawText: "需要数据产品经验和跨团队协作能力。",
    requirements: [
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

function createEducation(): ExperienceDetail {
  return createExperience({
    id: "edu-1",
    revisionId: "rev-edu-1",
    category: "education",
    title: "香港示例大学",
    organization: "信息系统专业",
    role: "学士",
    content: "主修信息系统与数据分析。",
    tags: ["数据分析"],
  });
}

function createWork(): ExperienceDetail {
  return createExperience({
    id: "work-1",
    revisionId: "rev-work-1",
    category: "work",
    title: "数据分析实习生",
    organization: "Example",
    role: "数据团队",
    content: WORK_CONTENT,
    tags: ["Python", "数据分析"],
  });
}

function createExperience(input: {
  id: string;
  revisionId: string;
  category: "education" | "work";
  title: string;
  organization: string;
  role: string;
  content: string;
  tags: string[];
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
