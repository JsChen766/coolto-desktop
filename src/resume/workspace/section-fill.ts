import type { ResumeCompileResult } from "../compiler-types.js";
import type { ResumeSourceSnapshot } from "../source-types.js";
import type { BulletEvidenceBinding } from "../source-types.js";
import type { ResumeStructure } from "../types.js";
import { rankAvailableEvidence } from "../quality/evidence-candidates.js";
import { calculateResumeBudget } from "./candidate-budget.js";
import {
  applyCandidatePatch,
  introducesWorseViolations,
} from "./candidate-patch.js";
import type { ResumeCompiler } from "./compiler-port.js";
import { resolveOperationsBestEffort } from "./evidence-resolution.js";
import { writePlan } from "./diagnostics-projection.js";

const MAX_SECTION_FILL_OPERATIONS = 3;

export interface SectionFillOperation {
  itemId: string;
  bulletId?: string;
  bulletText: string;
  evidenceId: string;
}

export interface SectionFillOutcome {
  structure: ResumeStructure;
  bindings: BulletEvidenceBinding[];
  compileResult: ResumeCompileResult;
  applied: boolean;
  fills: SectionFillOperation[];
}

/**
 * Deterministic host-side content fill. When the model stops with the page
 * underfilled (pxToMinimum > 0) or items still missing planned bullets, the
 * host appends the next unused evidence sentence of each experience to its
 * existing bullet, or adds it as a verbatim bullet for empty items. Every
 * fill passes the EvidenceLedger by construction; the patch is recompiled and
 * rolled back on any new violation. Content quality gates stay identical.
 */
export async function trySectionFill(
  compiler: ResumeCompiler,
  snapshot: ResumeSourceSnapshot,
  structure: ResumeStructure,
  bindings: readonly BulletEvidenceBinding[],
  compileResult: ResumeCompileResult,
): Promise<SectionFillOutcome> {
  const operations = buildSectionFillOperations({
    sourceSnapshot: snapshot,
    structure,
    bindings,
    compileResult,
  });
  if (!operations.length) {
    return {
      structure,
      bindings: [...bindings],
      compileResult,
      applied: false,
      fills: [],
    };
  }
  const resolution = resolveOperationsBestEffort(
    snapshot,
    structure,
    bindings,
    operations.map((operation) =>
      operation.bulletId
        ? {
            op: "append_text" as const,
            bulletId: operation.bulletId,
            text: operation.bulletText,
            evidenceIds: [operation.evidenceId],
          }
        : {
            op: "add_bullet" as const,
            itemId: operation.itemId,
            binding: {
              bulletText: operation.bulletText,
              evidenceIds: [operation.evidenceId],
            },
          },
    ),
  );
  if (!resolution.resolved.length) {
    return {
      structure,
      bindings: [...bindings],
      compileResult,
      applied: false,
      fills: [],
    };
  }
  const applied = applyCandidatePatch(
    snapshot,
    structure,
    bindings,
    resolution.resolved,
  );
  const compiled = await compiler.compile(applied.structure);
  if (introducesWorseViolations(compileResult, compiled)) {
    return {
      structure,
      bindings: [...bindings],
      compileResult,
      applied: false,
      fills: [],
    };
  }
  return {
    structure: applied.structure,
    bindings: applied.bindings,
    compileResult: compiled,
    applied: true,
    fills: operations,
  };
}

export function buildSectionFillOperations(input: {
  sourceSnapshot: ResumeSourceSnapshot;
  structure: ResumeStructure;
  bindings: readonly BulletEvidenceBinding[];
  compileResult: ResumeCompileResult;
}, maxOperations = MAX_SECTION_FILL_OPERATIONS): SectionFillOperation[] {
  if (
    input.compileResult.violations.some(
      (violation) =>
        violation.code === "page_overflow" ||
        violation.code === "multiple_pages",
    )
  ) {
    return [];
  }
  const budget = calculateResumeBudget(input.compileResult);
  if (budget.pxToMinimum <= 0 && !hasMissingBullets(input)) return [];

  const unusedByExperience = groupUnusedByExperience(input);
  const consumed = new Set<string>();
  const operations: SectionFillOperation[] = [];

  for (const plan of missingBulletPlans(input)) {
    if (operations.length >= maxOperations) break;
    const experienceId = experienceIdForItem(input.structure, plan.itemId);
    if (!experienceId) continue;
    const candidate = unusedByExperience
      .get(experienceId)
      ?.find((item) => !consumed.has(item.evidenceId));
    if (!candidate) continue;
    operations.push({
      itemId: plan.itemId,
      bulletText: candidate.sourceQuote,
      evidenceId: candidate.evidenceId,
    });
    consumed.add(candidate.evidenceId);
  }

  for (const [experienceId, candidates] of unusedByExperience) {
    if (operations.length >= maxOperations) break;
    const candidate = candidates.find(
      (item) => !consumed.has(item.evidenceId),
    );
    if (!candidate) continue;
    const bullet = firstBulletOfExperience(input.structure, experienceId);
    if (!bullet) continue;
    operations.push({
      itemId: bullet.itemId,
      bulletId: bullet.bulletId,
      bulletText: candidate.sourceQuote,
      evidenceId: candidate.evidenceId,
    });
    consumed.add(candidate.evidenceId);
  }
  return operations;
}

function hasMissingBullets(input: {
  structure: ResumeStructure;
  sourceSnapshot: ResumeSourceSnapshot;
  bindings: readonly BulletEvidenceBinding[];
}): boolean {
  return missingBulletPlans(input).length > 0;
}

function missingBulletPlans(input: {
  structure: ResumeStructure;
  sourceSnapshot: ResumeSourceSnapshot;
  bindings: readonly BulletEvidenceBinding[];
}): Array<{ itemId: string; missing: number }> {
  return (
    writePlan(input) as Array<{
      itemId: string;
      missing: number;
      unusedEvidenceCount: number;
    }>
  )
    .filter((plan) => plan.missing > 0 && plan.unusedEvidenceCount > 0)
    .sort((left, right) => right.missing - left.missing);
}

function experienceIdForItem(
  structure: ResumeStructure,
  itemId: string,
): string | null {
  for (const section of structure.sections) {
    const item = section.items.find((candidate) => candidate.id === itemId);
    if (item) return item.source_experience_id;
  }
  return null;
}

function firstBulletOfExperience(
  structure: ResumeStructure,
  experienceId: string,
): { itemId: string; bulletId: string } | undefined {
  for (const section of structure.sections) {
    for (const item of section.items) {
      if (item.source_experience_id !== experienceId) continue;
      const bullet = item.bullets[0];
      if (bullet) return { itemId: item.id, bulletId: bullet.id };
    }
  }
  return undefined;
}

function groupUnusedByExperience(input: {
  sourceSnapshot: ResumeSourceSnapshot;
  bindings: readonly BulletEvidenceBinding[];
}): Map<string, ReturnType<typeof rankAvailableEvidence>> {
  const groups = new Map<string, ReturnType<typeof rankAvailableEvidence>>();
  for (const candidate of rankAvailableEvidence(
    input.sourceSnapshot,
    input.bindings,
  )) {
    const list = groups.get(candidate.experienceId) ?? [];
    list.push(candidate);
    groups.set(candidate.experienceId, list);
  }
  return groups;
}

