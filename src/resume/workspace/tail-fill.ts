import type { ResumeCompileResult } from "../compiler-types.js";
import type { ResumeSourceSnapshot } from "../source-types.js";
import type { BulletEvidenceBinding } from "../source-types.js";
import type { ResumeStructure } from "../types.js";
import { rankAvailableEvidence } from "../quality/evidence-candidates.js";
import { bulletTailDiagnostics } from "./diagnostics-projection.js";
import {
  applyCandidatePatch,
  introducesWorseViolations,
} from "./candidate-patch.js";
import type { ResumeCompiler } from "./compiler-port.js";
import { resolveOperationsBestEffort } from "./evidence-resolution.js";
import type { EvidenceRepairAction } from "./evidence-auto-repair.js";

const MAX_TAIL_FILL_OPERATIONS = 2;
const MAX_APPEND_CHARS = 120;

export interface TailFillOperation {
  bulletId: string;
  text: string;
  evidenceId: string;
  shortByChars: number;
}

export interface TailFillOutcome {
  structure: ResumeStructure;
  bindings: BulletEvidenceBinding[];
  compileResult: ResumeCompileResult;
  repairs: EvidenceRepairAction[];
}

/**
 * Deterministic host-side tail-line repair. When the compile result reports
 * only tail-deficit violations, the host appends the next unused evidence
 * sentence of the same experience to each short bullet (verbatim source text,
 * so the EvidenceLedger passes by construction). The patch is recompiled and
 * rolled back entirely if any new violation appears.
 */
export async function tryTailFill(
  compiler: ResumeCompiler,
  snapshot: ResumeSourceSnapshot,
  structure: ResumeStructure,
  bindings: readonly BulletEvidenceBinding[],
  compileResult: ResumeCompileResult,
): Promise<TailFillOutcome> {
  const operations = buildTailFillOperations({
    sourceSnapshot: snapshot,
    structure,
    bindings,
    compileResult,
  });
  if (!operations.length) {
    return { structure, bindings: [...bindings], compileResult, repairs: [] };
  }
  const resolution = resolveOperationsBestEffort(
    snapshot,
    structure,
    bindings,
    operations.map((operation) => ({
      op: "append_text" as const,
      bulletId: operation.bulletId,
      text: operation.text,
      evidenceIds: [operation.evidenceId],
    })),
  );
  if (!resolution.resolved.length) {
    return { structure, bindings: [...bindings], compileResult, repairs: [] };
  }
  const applied = applyCandidatePatch(
    snapshot,
    structure,
    bindings,
    resolution.resolved,
  );
  const compiled = await compiler.compile(applied.structure);
  if (introducesWorseViolations(compileResult, compiled)) {
    return { structure, bindings: [...bindings], compileResult, repairs: [] };
  }
  return {
    structure: applied.structure,
    bindings: applied.bindings,
    compileResult: compiled,
    repairs: operations.map((operation) => ({
      kind: "tail_fill" as const,
      action: "added" as const,
      bulletId: operation.bulletId,
      evidenceIds: [operation.evidenceId],
    })),
  };
}

export function buildTailFillOperations(input: {
  sourceSnapshot: ResumeSourceSnapshot;
  structure: ResumeStructure;
  bindings: readonly BulletEvidenceBinding[];
  compileResult: ResumeCompileResult;
}, maxOperations = MAX_TAIL_FILL_OPERATIONS): TailFillOperation[] {
  if (!isTailFillEligible(input.compileResult)) return [];
  const diagnostics = bulletTailDiagnostics(input) as Array<{
    bulletId: string;
    shortByChars: number;
  }>;
  if (!diagnostics.length) return [];
  const unusedByExperience = new Map(
    rankAvailableEvidence(input.sourceSnapshot, input.bindings).map(
      (candidate) => [candidate.experienceId, candidate],
    ),
  );
  const operations: TailFillOperation[] = [];
  for (const diagnostic of diagnostics) {
    if (operations.length >= maxOperations) break;
    const binding = input.bindings.find(
      (candidate) => candidate.bulletId === diagnostic.bulletId,
    );
    if (!binding) continue;
    const candidate = unusedByExperience.get(binding.sourceExperienceId);
    if (
      !candidate ||
      [...candidate.sourceQuote].length < diagnostic.shortByChars ||
      [...candidate.sourceQuote].length > MAX_APPEND_CHARS
    ) {
      continue;
    }
    operations.push({
      bulletId: diagnostic.bulletId,
      text: candidate.sourceQuote,
      evidenceId: candidate.evidenceId,
      shortByChars: diagnostic.shortByChars,
    });
  }
  return operations;
}

function isTailFillEligible(compileResult: ResumeCompileResult): boolean {
  const violations = compileResult.violations;
  if (!violations.some((violation) => violation.code === "bullet_tail_too_short")) {
    return false;
  }
  return !violations.some(
    (violation) =>
      violation.code === "page_overflow" ||
      violation.code === "multiple_pages" ||
      violation.code === "missing_measurement_nodes" ||
      violation.code === "invalid_page_geometry",
  );
}

