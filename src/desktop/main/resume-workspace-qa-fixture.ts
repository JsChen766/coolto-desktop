import type {
  ExperienceDetail,
  JdRecord,
  UserProfile,
} from "../../api/types.js";
import { getResumeFixture } from "../../resume/fixtures.js";
import { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import type {
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
} from "../../resume/source-types.js";
import type { ResumeSectionItem } from "../../resume/types.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { allEvidenceCandidates } from "../../resume/quality/evidence-candidates.js";
import type { EvidenceBindingInput } from "../../resume/workspace/types.js";

export function createResumeWorkspaceQaFixture() {
  const fixture = getResumeFixture("zh-qualified");
  // The production skeleton now uses 五号 body text. Keep this QA candidate
  // representative of a one-page draft instead of the old 9.75pt capacity.
  fixture.sections.find((section) => section.type === "experience")
    ?.items.forEach((item) => item.bullets.pop());
  const sourceItems = fixture.sections.flatMap((section) =>
    section.type === "education" ||
    section.type === "experience" ||
    section.type === "project" ||
    section.type === "skills"
      ? section.items.map((item) => ({ sectionType: section.type, item }))
      : [],
  );
  const skillTags =
    fixture.sections
      .find((section) => section.type === "skills")
      ?.items[0]?.raw_text?.split("、") ?? [];
  const experiences = sourceItems.map(({ sectionType, item }, index) =>
    experienceFromItem(sectionType, item, index === 0 ? skillTags : []),
  );
  const experienceIds = experiences.map((experience) => experience.id);
  const byId = new Map(experiences.map((experience) => [experience.id, experience]));
  const builder = new ResumeSourceSnapshotBuilder(
    {
      currentUser: {
        getCurrentUser: async () => ({ id: "qa-user", email: "qa@example.com" }),
      },
      profile: { getUserProfile: async () => profileFromFixture(fixture) },
      jd: {
        listJds: async () => ({ items: [qaJd()], nextCursor: null }),
        getJd: async () => qaJd(),
      },
      experience: {
        searchExperiences: async () => ({ items: experiences, nextCursor: null }),
        getExperience: async (id) => {
          const experience = byId.get(id);
          if (!experience) throw new Error(`Missing QA experience ${id}`);
          return structuredClone(experience);
        },
      },
    },
    { now: () => new Date("2026-07-23T00:00:00.000Z") },
  );
  return { builder, sourceItems, experienceIds };
}

export function qaBindingFor(
  snapshot: ResumeSourceSnapshot,
  item: ResumeSectionItem,
  bulletId: string,
  bulletText: string,
): EvidenceBindingInput {
  const sourceExperienceId = item.source_experience_id!;
  const experience = snapshot.experiences.find(
    (candidate) => candidate.id === sourceExperienceId,
  )!;
  const start = experience.content.indexOf(bulletText);
  if (start < 0) {
    throw new Error(`QA bullet ${bulletId} is missing from its source experience`);
  }
  const end = start + bulletText.length;
  const cited = allEvidenceCandidates(snapshot)
    .filter(
      (candidate) =>
        candidate.experienceId === sourceExperienceId &&
        candidate.sourceStart >= start &&
        candidate.sourceEnd <= end,
    )
    .map((candidate) => ({ evidenceId: candidate.evidenceId }));
  if (!cited.length) {
    throw new Error(`QA bullet ${bulletId} has no sentence candidate inside it`);
  }
  void bulletId;
  return { bulletText, evidenceIds: cited.map((candidate) => candidate.evidenceId) };
}

export function evidenceBindingInputFrom(
  binding: BulletEvidenceBinding,
): EvidenceBindingInput {
  return {
    bulletText: binding.bulletText,
    evidenceIds: binding.excerpts.map(
      (excerpt) =>
        `${excerpt.experienceId}:${excerpt.sourceStart}:${excerpt.sourceEnd}`,
    ),
  };
}

export function selectComparableBindingPair(
  bindings: BulletEvidenceBinding[],
  compileResult: Awaited<ReturnType<ResumeCompiler["compile"]>>,
): [BulletEvidenceBinding, BulletEvidenceBinding] {
  const measurements = new Map(
    compileResult.bullets.map((measurement) => [measurement.bulletId, measurement]),
  );
  const candidates: Array<{
    pair: [BulletEvidenceBinding, BulletEvidenceBinding];
    distance: number;
  }> = [];
  for (let left = 0; left < bindings.length; left += 1) {
    for (let right = left + 1; right < bindings.length; right += 1) {
      const first = bindings[left]!;
      const second = bindings[right]!;
      if (
        first.sourceExperienceId === second.sourceExperienceId &&
        measurements.get(first.bulletId)?.lineCount ===
          measurements.get(second.bulletId)?.lineCount
      ) {
        candidates.push({
          pair: [first, second],
          distance: Math.abs(first.bulletText.length - second.bulletText.length),
        });
      }
    }
  }
  const selected = candidates.sort((left, right) => left.distance - right.distance)[0];
  if (!selected) throw new Error("G4 Chromium QA needs two comparable bullets");
  return selected.pair;
}

function experienceFromItem(
  sectionType: "education" | "experience" | "project" | "skills",
  item: ResumeSectionItem,
  tags: string[],
): ExperienceDetail {
  const id = item.source_experience_id ?? `qa-${item.id}`;
  const revisionId = `revision-${id}`;
  const content = item.bullets.length
    ? item.bullets.map((bullet) => bullet.text).join("\n")
    : [item.title, item.organization, item.role].filter(Boolean).join("，");
  const revision = {
    id: revisionId,
    experienceId: id,
    content,
    source: "manual",
    revisionHash: `hash-${revisionId}`,
    factBankStatus: "ready",
    createdAt: "2026-07-01T00:00:00Z",
  };
  return {
    id,
    category: sectionType === "experience" ? "work" : sectionType === "skills" ? "other" : sectionType,
    title: item.title ?? "Untitled",
    organization: item.organization,
    role: item.role,
    location: item.location ?? null,
    startDate: item.start_date,
    endDate: item.end_date,
    tags,
    resumeSectionKey: sectionType === "skills" ? "skills" : null,
    resumeSectionLabel: sectionType === "skills" ? "专业技能" : null,
    status: "active",
    currentRevisionId: revisionId,
    currentRevision: revision,
    revisions: [revision],
    entityVersion: 1,
    deletedAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
  };
}

function profileFromFixture(
  fixture: ReturnType<typeof getResumeFixture>,
): UserProfile {
  return {
    fullName: fixture.contact?.name ?? null,
    contactEmail: "qa-resume@example.com",
    email: "qa@example.com",
    phone: fixture.contact?.phone ?? null,
    location: fixture.contact?.location ?? null,
    linkedinUrl: fixture.contact?.linkedin ?? null,
    githubUrl: null,
    personalWebsite: null,
    currentTitle: null,
    currentCompany: null,
    yearsOfExperience: null,
    careerStage: null,
    targetRoles: [],
    targetIndustries: [],
    targetLocations: [],
    preferredLanguage: "zh-CN",
    resumeStyle: "standard",
  };
}

function qaJd(): JdRecord {
  return {
    id: "qa-jd",
    title: "G4 QA",
    company: "Coolto",
    targetRole: "Product Manager",
    rawText: "Validate the grounded resume quality repair loop.",
    requirements: [],
    jdHash: "qa-jd-hash",
    requirementMapId: null,
    requirementsOrigin: "qa",
    sourceThreadId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
  };
}
