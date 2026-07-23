import type {
  ExperienceDetail,
  JdRecord,
  UserProfile,
} from "../../api/types.js";
import { getResumeFixture } from "../../resume/fixtures.js";
import { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import type { BulletEvidenceBinding } from "../../resume/source-types.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../../resume/template-contract.js";
import type { ResumeSectionItem } from "../../resume/types.js";
import { ResumeCandidatePatcher } from "../../resume/workspace/candidate-patcher.js";
import { ResumeCandidatePreparer } from "../../resume/workspace/candidate-preparer.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";

export async function runResumeWorkspaceQa(compiler: ResumeCompiler) {
  const fixture = getResumeFixture("zh-qualified");
  const sourceItems = fixture.sections.flatMap((section) =>
    section.type === "education" ||
    section.type === "experience" ||
    section.type === "project"
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
          if (!experience) throw new Error(`Missing G3 QA experience ${id}`);
          return structuredClone(experience);
        },
      },
    },
    { now: () => new Date("2026-07-23T00:00:00.000Z") },
  );
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "g3-chromium-qa",
  });
  const patcher = new ResumeCandidatePatcher(compiler, store);
  const snapshot = await builder.build({
    jdId: "qa-jd",
    experienceIds,
    template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const prepared = await preparer.prepare({
    jdId: "qa-jd",
    experienceIds,
    language: "zh-CN",
  });
  const bindings = sourceItems.flatMap(({ item }) =>
    item.bullets.map((bullet) => bindingFor(snapshot, item, bullet.id, bullet.text)),
  );
  const patched = await patcher.patch({
    candidateId: prepared.candidateId,
    expectedRevision: 0,
    operations: bindings.map((binding) => ({
      op: "add_bullet" as const,
      itemId: `item-${binding.sourceExperienceId}`,
      binding,
    })),
  });
  return {
    preparedStatus: prepared.status,
    finalStatus: patched.status,
    revision: patched.revision,
    bindingCount: patched.bindings.length,
    sourceFingerprint: patched.sourceSnapshot.sourceFingerprint,
    compileResult: patched.compileResult,
  };
}

function experienceFromItem(
  sectionType: "education" | "experience" | "project",
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
    category:
      sectionType === "experience" ? "work" : sectionType,
    title: item.title ?? "Untitled",
    organization: item.organization,
    role: item.role,
    location: item.location ?? null,
    startDate: item.start_date,
    endDate: item.end_date,
    tags,
    status: "active",
    currentRevisionId: revisionId,
    currentRevision: revision,
    revisions: [revision],
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
  };
}

function profileFromFixture(
  fixture: ReturnType<typeof getResumeFixture>,
): UserProfile {
  return {
    fullName: fixture.contact?.name ?? null,
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
    title: "G3 QA",
    company: "Coolto",
    targetRole: "Product Manager",
    rawText: "Validate the grounded resume generation loop.",
    requirements: [],
    jdHash: "qa-jd-hash",
    requirementMapId: null,
    requirementsOrigin: "qa",
    sourceThreadId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
  };
}

function bindingFor(
  snapshot: Awaited<ReturnType<ResumeSourceSnapshotBuilder["build"]>>,
  item: ResumeSectionItem,
  bulletId: string,
  bulletText: string,
): BulletEvidenceBinding {
  const sourceExperienceId = item.source_experience_id!;
  const experience = snapshot.experiences.find(
    (candidate) => candidate.id === sourceExperienceId,
  )!;
  const sourceStart = experience.content.indexOf(bulletText);
  return {
    bulletId,
    sourceExperienceId,
    bulletText,
    excerpts: [
      {
        experienceId: sourceExperienceId,
        revisionId: experience.revisionId,
        revisionContentHash: experience.contentHash,
        sourceStart,
        sourceEnd: sourceStart + bulletText.length,
        sourceQuote: bulletText,
      },
    ],
    matchedRequirementIds: [],
  };
}
