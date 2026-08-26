import type {
  CurrentUserReader,
  ExperienceReader,
  JdReader,
  UserProfileReader,
} from "../api/types.js";
import {
  normalizeSourceExperience,
  normalizeSourceJd,
  normalizeSourceProfile,
} from "./source-normalization.js";
import {
  RESUME_SOURCE_SNAPSHOT_SCHEMA_VERSION,
  type ResumeSourceSnapshot,
  type ResumeSourceSnapshotInput,
} from "./source-types.js";
import { ResumeSourceSnapshotError } from "./source-snapshot-error.js";
import { deepFreeze, sha256, stableStringify } from "./stable-snapshot.js";
import { missingResumeContactFields } from "./contracts/profile-contact.js";
import { experienceEvidenceEligibility } from "../experience/evidence-eligibility.js";
import { orderResumeSourceExperiences } from "./education-order.js";

export {
  ResumeSourceSnapshotError,
  type ResumeSourceSnapshotErrorCode,
} from "./source-snapshot-error.js";

export interface ResumeSourceSnapshotReaders {
  currentUser: CurrentUserReader;
  profile: UserProfileReader;
  jd: JdReader;
  experience: ExperienceReader;
}

export interface ResumeSourceSnapshotBuilderOptions {
  now?: () => Date;
}

export class ResumeSourceSnapshotBuilder {
  readonly #readers: ResumeSourceSnapshotReaders;
  readonly #now: () => Date;

  public constructor(
    readers: ResumeSourceSnapshotReaders,
    options: ResumeSourceSnapshotBuilderOptions = {},
  ) {
    this.#readers = readers;
    this.#now = options.now ?? (() => new Date());
  }

  public async build(
    input: ResumeSourceSnapshotInput,
    signal?: AbortSignal,
  ): Promise<ResumeSourceSnapshot> {
    const jdId = input.jdId.trim();
    const experienceIds = input.experienceIds
      .map((value) => value.trim())
      .sort((left, right) => left.localeCompare(right));
    validateRequest(jdId, experienceIds);

    const [currentUser, profile, jd, educationIds] = await Promise.all([
      this.#readers.currentUser.getCurrentUser(signal),
      this.#readers.profile.getUserProfile(signal),
      this.#readers.jd.getJd(jdId, signal),
      this.#activeEducationIds(signal),
    ]);
    const completeExperienceIds = [...new Set([...experienceIds, ...educationIds])];
    const experiences = await Promise.all(
      completeExperienceIds.map((experienceId) =>
        this.#readers.experience.getExperience(experienceId, signal),
      ),
    );
    const requestedExperienceIds = new Set(experienceIds);
    const normalizedExperiences = orderResumeSourceExperiences(
      experiences.flatMap((experience, index) => {
        const experienceId = completeExperienceIds[index] ?? "";
        try {
          return [normalizeSourceExperience(experience, experienceId)];
        } catch (error: unknown) {
          if (
            !requestedExperienceIds.has(experienceId) &&
            error instanceof ResumeSourceSnapshotError &&
            error.code === "inactive_experience"
          ) return [];
          throw error;
        }
      }),
    );
    const fingerprintPayload = {
      schemaVersion: RESUME_SOURCE_SNAPSHOT_SCHEMA_VERSION,
      profile: normalizeSourceProfile(
        currentUser.id,
        currentUser.email,
        profile,
      ),
      jd: normalizeSourceJd(jd, jdId),
      experiences: normalizedExperiences,
      template: input.template,
    };
    validateResumeContact(fingerprintPayload.profile);
    return deepFreeze({
      ...fingerprintPayload,
      capturedAt: this.#now().toISOString(),
      sourceFingerprint: sha256(stableStringify(fingerprintPayload)),
    });
  }

  async #activeEducationIds(signal?: AbortSignal): Promise<string[]> {
    const ids = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await this.#readers.experience.searchExperiences(
        { category: "education", status: "active", limit: 100, ...(cursor ? { cursor } : {}) },
        signal,
      );
      for (const experience of page.items) {
        if (
          experience.category === "education" &&
          experienceEvidenceEligibility(experience).eligible
        ) ids.add(experience.id);
      }
      cursor = page.nextCursor ?? undefined;
      if (cursor && cursors.has(cursor)) break;
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return [...ids].sort((left, right) => left.localeCompare(right));
  }
}

function validateResumeContact(profile: {
  fullName: string | null; phone: string | null; contactEmail: string | null;
}): void {
  const missing = missingResumeContactFields({
    ...profile, location: null, linkedinUrl: null, githubUrl: null,
    personalWebsite: null,
  });
  if (missing.length) throw new ResumeSourceSnapshotError(
    "missing_required_profile_fields",
    `Resume generation requires: ${missing.join(", ")}.`,
  );
}

function validateRequest(jdId: string, experienceIds: readonly string[]): void {
  if (!jdId || experienceIds.length === 0 || experienceIds.some((value) => !value)) {
    throw new ResumeSourceSnapshotError(
      "invalid_snapshot_request",
      "A JD and at least one experience are required.",
    );
  }
  if (new Set(experienceIds).size !== experienceIds.length) {
    throw new ResumeSourceSnapshotError(
      "duplicate_experience_id",
      "Experience IDs in a source snapshot must be unique.",
    );
  }
}
