import {
  candidateMap,
  assertSupportedNumbers,
  resolveExcerpts,
} from "./evidence-binding-resolver.js";
import type { BulletEvidenceBinding, ResumeSourceSnapshot } from "../source-types.js";
import type { ResumeFull, ResumeSectionItem, ResumeStructure } from "../types.js";
import type { ResumeBulletProvenance, ResumeWorkspace } from "./types.js";
import type { AvailableEvidenceCandidate } from "../quality/types.js";

export interface PublishedResumeSeedResult {
  structure: ResumeStructure;
  bindings: BulletEvidenceBinding[];
  bulletProvenance: ResumeBulletProvenance[];
  retainedBulletCount: number;
  droppedBulletCount: number;
}

export function samePublishedResumeSeed(
  left: ResumeWorkspace["reuseBase"],
  right: ResumeWorkspace["reuseBase"],
): boolean {
  return left?.resumeId === right?.resumeId &&
    left?.contentHash === right?.contentHash;
}

export function seedFromPublishedResume(input: {
  fresh: ResumeStructure;
  snapshot: ResumeSourceSnapshot;
  base: ResumeFull;
}): PublishedResumeSeedResult {
  assertEligibleBase(input.base, input.fresh.language);
  const structure = structuredClone(input.fresh);
  const priorItems = new Map(input.base.structured.sections.flatMap((section) =>
    section.items.flatMap((item) => item.source_experience_id
      ? [[itemKey(section.type, item.source_experience_id), item] as const]
      : []),
  ));
  const candidates = candidateMap(input.snapshot);
  const bindings: BulletEvidenceBinding[] = [];
  const bulletProvenance: ResumeBulletProvenance[] = [];
  const usedBulletIds = new Set<string>();
  let retainedBulletCount = 0;
  let droppedBulletCount = 0;
  for (const section of structure.sections) {
    for (const item of section.items) {
      const sourceId = item.source_experience_id;
      const prior = sourceId
        ? priorItems.get(itemKey(section.type, sourceId))
        : undefined;
      if (!prior) continue;
      for (const bullet of prior.bullets) {
        const seeded = seedBullet({
          bullet, item, skillItem: section.type === "skills",
          candidates, usedBulletIds,
        });
        if (!seeded) { droppedBulletCount += 1; continue; }
        item.bullets.push(seeded.bullet);
        bindings.push(seeded.binding);
        bulletProvenance.push(seeded.provenance);
        retainedBulletCount += 1;
      }
    }
  }
  if (retainedBulletCount === 0) {
    throw new Error("历史 Resume 没有与当前 Experience 修订一致的 grounded bullet");
  }
  return {
    structure, bindings, bulletProvenance,
    retainedBulletCount, droppedBulletCount,
  };
}

function seedBullet(input: {
  bullet: ResumeSectionItem["bullets"][number];
  item: ResumeSectionItem;
  skillItem: boolean;
  candidates: ReturnType<typeof candidateMap>;
  usedBulletIds: Set<string>;
}) {
  const bulletId = input.bullet.id.trim();
  const evidence = input.bullet.source_evidence ?? [];
  if (!bulletId || !input.bullet.text.trim() || !evidence.length ||
      input.usedBulletIds.has(bulletId)) return undefined;
  const evidenceIds = evidence.map((entry) =>
    `${entry.experience_id}:${entry.source_start}:${entry.source_end}`,
  );
  const current = evidenceIds.map((id) => input.candidates.get(id));
  if (current.some((candidate, index) => !candidate || !sameEvidence(
    candidate!, evidence[index]!,
  ))) return undefined;
  let resolved;
  try {
    resolved = resolveExcerpts({
      bulletText: input.bullet.text,
      evidenceIds,
    }, input.candidates, input.skillItem);
    if (!input.skillItem &&
        resolved.sourceExperienceId !== input.item.source_experience_id) return undefined;
    assertSupportedNumbers(input.bullet.text, resolved.excerpts, input.candidates);
  } catch { return undefined; }
  const binding: BulletEvidenceBinding = {
    bulletId, ...resolved,
    ...(input.skillItem ? { sharedEvidence: true } : {}),
  };
  input.usedBulletIds.add(bulletId);
  return {
    bullet: {
      ...structuredClone(input.bullet),
      matched_jd_requirement_ids: [...binding.matchedRequirementIds],
      source_fact_ids: evidenceIds,
      source_evidence: binding.excerpts.map((excerpt) => ({
        experience_id: excerpt.experienceId,
        revision_id: excerpt.revisionId,
        revision_content_hash: excerpt.revisionContentHash,
        source_start: excerpt.sourceStart,
        source_end: excerpt.sourceEnd,
        source_quote: excerpt.sourceQuote,
      })),
    },
    binding,
    provenance: {
      bulletId, itemId: input.item.id, origin: "grounded" as const,
      evidenceIds, requirementIds: [...binding.matchedRequirementIds],
      confirmation: "not_required" as const,
    },
  };
}

function sameEvidence(
  candidate: AvailableEvidenceCandidate,
  evidence: NonNullable<ResumeSectionItem["bullets"][number]["source_evidence"]>[number],
): boolean {
  return candidate.experienceId === evidence.experience_id &&
    candidate.revisionId === evidence.revision_id &&
    candidate.revisionContentHash === evidence.revision_content_hash &&
    candidate.sourceStart === evidence.source_start &&
    candidate.sourceEnd === evidence.source_end &&
    candidate.sourceQuote === evidence.source_quote;
}

function itemKey(type: string, experienceId: string): string {
  return `${type}:${experienceId}`;
}

function assertEligibleBase(base: ResumeFull, language: string): void {
  if (base.qualityStatus !== "passed" || base.status === "archived" ||
      base.deletedAt || !base.jdId) {
    throw new Error("历史 Resume 未通过质量门槛、已归档或缺少来源 JD");
  }
  if (base.structured.language !== language) {
    throw new Error("历史 Resume 语言与新工作区不一致，不能作为基底");
  }
}
