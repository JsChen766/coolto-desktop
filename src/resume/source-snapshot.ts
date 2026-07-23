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

    const [currentUser, profile, jd, experiences] = await Promise.all([
      this.#readers.currentUser.getCurrentUser(signal),
      this.#readers.profile.getUserProfile(signal),
      this.#readers.jd.getJd(jdId, signal),
      Promise.all(
        experienceIds.map((experienceId) =>
          this.#readers.experience.getExperience(experienceId, signal),
        ),
      ),
    ]);
    if (
      profile.email &&
      currentUser.email &&
      profile.email.toLocaleLowerCase() !== currentUser.email.toLocaleLowerCase()
    ) {
      throw new ResumeSourceSnapshotError(
        "profile_identity_mismatch",
        "The profile email does not match the authenticated user.",
      );
    }
    const fingerprintPayload = {
      schemaVersion: RESUME_SOURCE_SNAPSHOT_SCHEMA_VERSION,
      profile: normalizeSourceProfile(currentUser.id, currentUser.email, profile),
      jd: normalizeSourceJd(jd, jdId),
      experiences: experiences.map((experience, index) =>
        normalizeSourceExperience(experience, experienceIds[index] ?? ""),
      ),
      template: input.template,
    };
    return deepFreeze({
      ...fingerprintPayload,
      capturedAt: this.#now().toISOString(),
      sourceFingerprint: sha256(stableStringify(fingerprintPayload)),
    });
  }
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
