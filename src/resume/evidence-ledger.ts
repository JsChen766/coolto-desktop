import type {
  BulletEvidenceBinding,
  EvidenceCandidate,
  EvidenceValidationIssue,
  ResumeSourceExperienceSnapshot,
  ResumeSourceSnapshot,
} from "./source-types.js";
import {
  EvidenceValidationError,
  normalizeEvidenceBinding,
  reservedRangesFromBindings,
  validateEvidenceBinding,
} from "./evidence-validation.js";

export {
  EvidenceValidationError,
  type EvidenceValidationErrorCode,
} from "./evidence-validation.js";

export class EvidenceLedger {
  readonly #snapshot: ResumeSourceSnapshot;
  readonly #experiences: ReadonlyMap<string, ResumeSourceExperienceSnapshot>;
  readonly #requirementIds: ReadonlySet<string>;
  readonly #bindings = new Map<string, BulletEvidenceBinding>();

  public constructor(snapshot: ResumeSourceSnapshot) {
    this.#snapshot = snapshot;
    this.#experiences = new Map(
      snapshot.experiences.map((experience) => [experience.id, experience]),
    );
    this.#requirementIds = new Set(
      snapshot.jd.requirements.map((requirement) => requirement.id),
    );
  }

  public get sourceFingerprint(): string {
    return this.#snapshot.sourceFingerprint;
  }

  public listBindings(): readonly BulletEvidenceBinding[] {
    return Array.from(this.#bindings.values(), (binding) =>
      structuredClone(binding),
    );
  }

  public reserve(
    binding: BulletEvidenceBinding,
    additionalNumericEvidence = "",
  ): void {
    const normalized = normalizeEvidenceBinding(binding);
    if (this.#bindings.has(normalized.bulletId)) {
      throw new EvidenceValidationError(
        "duplicate_bullet_id",
        `Bullet ${normalized.bulletId} already has an evidence binding.`,
        normalized.bulletId,
      );
    }
    validateEvidenceBinding(normalized, {
      experiences: this.#experiences,
      requirementIds: this.#requirementIds,
      reservedRanges: reservedRangesFromBindings(this.#bindings.values()),
      ...(additionalNumericEvidence ? { additionalNumericEvidence } : {}),
    });
    this.#bindings.set(normalized.bulletId, deepFreeze(normalized));
  }

  public release(bulletId: string): boolean {
    return this.#bindings.delete(bulletId.trim());
  }

  public replaceBinding(binding: BulletEvidenceBinding): void {
    const normalized = normalizeEvidenceBinding(binding);
    const previous = this.#bindings.get(normalized.bulletId);
    if (!previous) {
      this.reserve(normalized);
      return;
    }
    this.#bindings.delete(normalized.bulletId);
    try {
      this.reserve(normalized);
    } catch (error) {
      this.#bindings.set(previous.bulletId, previous);
      throw error;
    }
  }

  public validateCandidate(candidate: EvidenceCandidate): EvidenceValidationIssue[] {
    if (candidate.sourceFingerprint !== this.sourceFingerprint) {
      return [
        {
          code: "source_snapshot_mismatch",
          message: "Candidate source fingerprint does not match the active snapshot.",
        },
      ];
    }
    const ledger = new EvidenceLedger(this.#snapshot);
    const issues: EvidenceValidationIssue[] = [];
    for (const binding of candidate.bullets) {
      try {
        ledger.reserve(binding);
      } catch (error) {
        if (error instanceof EvidenceValidationError) {
          issues.push({
            code: error.code,
            message: error.message,
            ...(error.bulletId ? { bulletId: error.bulletId } : {}),
          });
        } else {
          throw error;
        }
      }
    }
    return issues;
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
