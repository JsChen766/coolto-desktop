import type {
  ExperienceDetail,
  JdRecord,
  UserProfile,
} from "../api/types.js";
import type {
  ResumeSourceExperienceSnapshot,
  ResumeSourceJdSnapshot,
  ResumeSourceProfileSnapshot,
} from "./source-types.js";
import { ResumeSourceSnapshotError } from "./source-snapshot-error.js";
import { sha256, stableStringify } from "./stable-snapshot.js";
import { experienceEvidenceEligibility } from "../experience/evidence-eligibility.js";

export function normalizeSourceProfile(
  userId: string,
  authenticatedEmail: string,
  profile: UserProfile,
): ResumeSourceProfileSnapshot {
  return {
    userId,
    fullName: cleanOptional(profile.fullName),
    email: authenticatedEmail.trim(),
    phone: cleanOptional(profile.phone),
    location: cleanOptional(profile.location),
    linkedinUrl: cleanOptional(profile.linkedinUrl),
    githubUrl: cleanOptional(profile.githubUrl),
    personalWebsite: cleanOptional(profile.personalWebsite),
    preferredLanguage: cleanOptional(profile.preferredLanguage),
    resumeStyle: cleanOptional(profile.resumeStyle),
  };
}

export function normalizeSourceJd(
  jd: JdRecord,
  expectedId: string,
): ResumeSourceJdSnapshot {
  if (jd.id !== expectedId || !jd.title.trim() || !jd.rawText.trim()) {
    throw new ResumeSourceSnapshotError(
      "invalid_jd",
      "The selected JD is missing or does not match the requested ID.",
    );
  }
  const requirementIds = jd.requirements.map((requirement) => requirement.id.trim());
  if (
    requirementIds.some((value) => !value) ||
    new Set(requirementIds).size !== requirementIds.length
  ) {
    throw new ResumeSourceSnapshotError(
      "duplicate_requirement_id",
      "JD requirement IDs must be present and unique.",
    );
  }
  const requirements = jd.requirements.map((requirement) => ({
    id: requirement.id.trim(),
    text: requirement.text.trim(),
    category: requirement.category.trim(),
    importance: requirement.importance,
    keywords: [...requirement.keywords],
    weight: requirement.weight,
    v2Importance: requirement.v2Importance,
    v2Category: cleanOptional(requirement.v2Category),
  }));
  return {
    id: jd.id,
    title: jd.title.trim(),
    company: cleanOptional(jd.company),
    targetRole: cleanOptional(jd.targetRole),
    rawText: jd.rawText,
    requirements,
    serverHash: cleanOptional(jd.jdHash),
    contentHash: sha256(stableStringify({ rawText: jd.rawText, requirements })),
    requirementsOrigin: jd.requirementsOrigin,
    updatedAt: jd.updatedAt,
  };
}

export function normalizeSourceExperience(
  experience: ExperienceDetail,
  expectedId: string,
): ResumeSourceExperienceSnapshot {
  const eligibility = experienceEvidenceEligibility(experience);
  if (experience.id !== expectedId || !eligibility.eligible) {
    throw new ResumeSourceSnapshotError(
      "inactive_experience",
      `Experience ${expectedId} is missing or inactive.`,
    );
  }
  const revision = experience.currentRevision;
  if (!revision || !experience.currentRevisionId) {
    throw new ResumeSourceSnapshotError(
      "missing_current_revision",
      `Experience ${experience.id} has no current revision.`,
    );
  }
  if (
    revision.id !== experience.currentRevisionId ||
    revision.experienceId !== experience.id
  ) {
    throw new ResumeSourceSnapshotError(
      "current_revision_mismatch",
      `Experience ${experience.id} returned an inconsistent current revision.`,
    );
  }
  if (!revision.content.trim()) {
    throw new ResumeSourceSnapshotError(
      "empty_revision_content",
      `Experience ${experience.id} current revision is empty.`,
    );
  }
  return {
    id: experience.id,
    category: experience.category,
    title: experience.title.trim(),
    organization: cleanOptional(experience.organization),
    role: cleanOptional(experience.role),
    location: cleanOptional(experience.location),
    startDate: cleanOptional(experience.startDate),
    endDate: cleanOptional(experience.endDate),
    tags: [...experience.tags],
    revisionId: revision.id,
    serverRevisionHash: cleanOptional(revision.revisionHash),
    contentHash: sha256(revision.content),
    content: revision.content,
    updatedAt: experience.updatedAt,
  };
}

function cleanOptional(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}
