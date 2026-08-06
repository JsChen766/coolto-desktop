import type { ResumeCompileResult } from "../compiler-types.js";
import type { ResumeSourceSnapshot } from "../source-types.js";
import type { BulletEvidenceBinding } from "../source-types.js";
import type { ResumeStructure } from "../types.js";
import { rankAvailableEvidence } from "../quality/evidence-candidates.js";
import { introducesWorseViolations } from "../workspace/candidate-patch.js";
import { applyCandidatePatch } from "../workspace/candidate-patch.js";
import type { ResumeCompiler } from "../workspace/compiler-port.js";
import { resolveOperationsBestEffort } from "../workspace/evidence-resolution.js";
import { trySectionFill } from "../workspace/section-fill.js";
import { tryTailFill } from "../workspace/tail-fill.js";

export interface FilledCandidate {
  structure: ResumeStructure;
  bindings: BulletEvidenceBinding[];
  compileResult: ResumeCompileResult;
}

/**
 * The last mile is deterministic: after the parallel write lands (~80%
 * usage), the host keeps filling from unused evidence (tail-line repair
 * first, then section fill for the usage gap) until the page reaches the
 * gate or no source sentence can be added. No model round is spent here.
 */
export async function fillToGate(
  compiler: ResumeCompiler,
  snapshot: ResumeSourceSnapshot,
  structure: ResumeStructure,
  bindings: readonly BulletEvidenceBinding[],
  compileResult: ResumeCompileResult,
): Promise<FilledCandidate> {
  let current: FilledCandidate = {
    structure,
    bindings: [...bindings],
    compileResult,
  };
  for (let round = 0; round < 3; round += 1) {
    if (current.compileResult.usageRatio >= 0.85) break;
    const lengthened = await fillShortBullets(
      compiler,
      snapshot,
      current.structure,
      current.bindings,
      current.compileResult,
    );
    if (
      lengthened.compileResult.usageRatio > current.compileResult.usageRatio
    ) {
      current = lengthened;
      continue;
    }
    const tail = await tryTailFill(
      compiler,
      snapshot,
      current.structure,
      current.bindings,
      current.compileResult,
    );
    if (tail.repairs.length) {
      current = {
        structure: tail.structure,
        bindings: tail.bindings,
        compileResult: tail.compileResult,
      };
      continue;
    }
    const section = await trySectionFill(
      compiler,
      snapshot,
      current.structure,
      current.bindings,
      current.compileResult,
    );
    if (!section.applied) break;
    current = {
      structure: section.structure,
      bindings: section.bindings,
      compileResult: section.compileResult,
    };
  }
  return current;
}

/**
 * Lengthens every bullet that fell below the target line count by appending
 * the next unused evidence sentence of the same experience, one at a time,
 * until the measured line count reaches the target or evidence runs out.
 */
async function fillShortBullets(
  compiler: ResumeCompiler,
  snapshot: ResumeSourceSnapshot,
  structure: ResumeStructure,
  bindings: readonly BulletEvidenceBinding[],
  compileResult: ResumeCompileResult,
): Promise<FilledCandidate> {
  let current: FilledCandidate = {
    structure,
    bindings: [...bindings],
    compileResult,
  };
  for (let round = 0; round < 3; round += 1) {
    const short = current.compileResult.bullets
      .filter(
        (measurement) =>
          measurement.lineCount > 0 && measurement.lineCount < 2,
      )
      .sort((left, right) => left.lineCount - right.lineCount)
      .slice(0, 3);
    if (!short.length) break;
    let changed = false;
    for (const measurement of short) {
      const binding = current.bindings.find(
        (candidate) => candidate.bulletId === measurement.bulletId,
      );
      if (!binding) continue;
      const candidate = rankAvailableEvidence(snapshot, current.bindings).find(
        (item) => item.experienceId === binding.sourceExperienceId,
      );
      if (!candidate) continue;
      const resolution = resolveOperationsBestEffort(
        snapshot,
        current.structure,
        current.bindings,
        [
          {
            op: "append_text" as const,
            bulletId: measurement.bulletId,
            text: candidate.sourceQuote,
            evidenceIds: [candidate.evidenceId],
          },
        ],
      );
      if (!resolution.resolved.length) continue;
      const applied = applyCandidatePatch(
        snapshot,
        current.structure,
        current.bindings,
        resolution.resolved,
      );
      const compiled = await compiler.compile(applied.structure);
      if (introducesWorseViolations(current.compileResult, compiled)) continue;
      current = {
        structure: applied.structure,
        bindings: applied.bindings,
        compileResult: compiled,
      };
      changed = true;
    }
    if (!changed) break;
  }
  return current;
}
