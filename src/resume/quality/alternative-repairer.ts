import { performance } from "node:perf_hooks";

import { EvidenceValidationError } from "../evidence-ledger.js";
import { applyCandidatePatch } from "../workspace/candidate-patch.js";
import {
  compareCandidateSnapshots,
  isBetterCandidate,
} from "../workspace/candidate-ranking.js";
import type { ResumeCompiler } from "../workspace/compiler-port.js";
import { ResumeWorkspaceError } from "../workspace/errors.js";
import { resolveOperations } from "../workspace/evidence-resolution.js";
import type {
  RepairResumeCandidateInput,
  ResumeCandidateSnapshot,
  ResumeWorkspace,
} from "../workspace/types.js";
import { ResumeWorkspaceStore } from "../workspace/workspace-store.js";
import {
  assertFrozenRegions,
  MAX_REPAIR_ROUNDS,
  validateRequest,
} from "./alternative-repair-policy.js";
import { applyQualityMetadata, statusAfterQualityReview } from "./quality-state.js";
import { ResumeQualityEvaluator } from "./quality-evaluator.js";

const BEAM_WIDTH = 4;

export class ResumeAlternativeRepairer {
  public constructor(
    private readonly compiler: ResumeCompiler,
    private readonly evaluator: ResumeQualityEvaluator,
    private readonly store: ResumeWorkspaceStore,
  ) {}

  public async repair(input: RepairResumeCandidateInput): Promise<ResumeWorkspace> {
    const startedAt = performance.now();
    const current = this.store.get(input.candidateId);
    validateRequest(current, input);
    const nextRevision = current.revision + 1;
    let beam: ResumeCandidateSnapshot[] = [snapshotFrom(current)];
    let alternativesEvaluated = 0;
    let candidatesCompiled = 0;
    for (const targetInput of input.alternativeTargets) {
      const target = current.qualityReport!.repairTargets.find(
        (candidate) => candidate.targetId === targetInput.targetId,
      )!;
      const expanded = [...beam];
      for (const seed of beam) {
        for (const alternative of targetInput.alternatives) {
          alternativesEvaluated += 1;
          assertFrozenRegions(current, target, alternative.operations);
          try {
            const patched = applyCandidatePatch(
              current.sourceSnapshot,
              seed.structure,
              seed.bindings,
              resolveOperations(
                current.sourceSnapshot,
                seed.structure,
                seed.bindings,
                alternative.operations,
              ),
            );
            const compileResult = await this.compiler.compile(patched.structure);
            candidatesCompiled += 1;
            const qualityReport = this.evaluator.evaluate(
              current.sourceSnapshot,
              patched.structure,
              patched.bindings,
              compileResult,
            );
            expanded.push({
              revision: nextRevision,
              structure: patched.structure,
              bindings: patched.bindings,
              compileResult,
              qualityReport,
            });
          } catch (error: unknown) {
            if (
              error instanceof ResumeWorkspaceError ||
              error instanceof EvidenceValidationError
            ) {
              continue;
            }
            throw error;
          }
        }
      }
      beam = expanded.sort(compareCandidateSnapshots).slice(0, BEAM_WIDTH);
    }
    const selected = beam[0];
    if (!selected?.qualityReport) {
      throw new ResumeWorkspaceError(
        "invalid_repair_target",
        "No valid quality repair alternative could be evaluated.",
      );
    }
    const repairRound = current.repairRound + 1;
    const status = statusAfterQualityReview(selected.qualityReport, repairRound);
    const structure = applyQualityMetadata(
      selected.structure,
      selected.qualityReport,
      status,
    );
    const selectedSnapshot: ResumeCandidateSnapshot = {
      ...selected,
      revision: nextRevision,
      structure: structuredClone(structure),
    };
    const bestSnapshot = isBetterCandidate(selectedSnapshot, current.bestSnapshot)
      ? selectedSnapshot
      : current.bestSnapshot;
    return this.store.replace(
      {
        ...current,
        revision: nextRevision,
        patchCount: current.patchCount + 1,
        repairRound,
        status,
        structure,
        bindings: selected.bindings,
        compileResult: selected.compileResult,
        qualityReport: selected.qualityReport,
        bestSnapshot,
        repairHistory: [
          ...current.repairHistory,
          {
            round: repairRound,
            targetIds: input.alternativeTargets.map((target) => target.targetId),
            alternativesEvaluated,
            candidatesCompiled,
            selectedRevision: nextRevision,
            selectedReason: selectionReason(selected),
            changedBulletIds: changedBulletIds(current, selectedSnapshot),
            elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
          },
        ],
      },
      input.expectedRevision,
    );
  }
}

function snapshotFrom(workspace: ResumeWorkspace): ResumeCandidateSnapshot {
  return {
    revision: workspace.revision,
    structure: workspace.structure,
    bindings: workspace.bindings,
    compileResult: workspace.compileResult,
    ...(workspace.qualityReport ? { qualityReport: workspace.qualityReport } : {}),
  };
}

function changedBulletIds(
  before: ResumeWorkspace,
  after: ResumeCandidateSnapshot,
): string[] {
  const beforeText = bulletTextById(before.structure);
  const afterText = bulletTextById(after.structure);
  return [...new Set([...beforeText.keys(), ...afterText.keys()])].filter(
    (id) => beforeText.get(id) !== afterText.get(id),
  );
}

function bulletTextById(structure: ResumeWorkspace["structure"]): Map<string, string> {
  return new Map(
    structure.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.bullets.map((bullet) => [bullet.id, bullet.text] as const),
      ),
    ),
  );
}

function selectionReason(snapshot: ResumeCandidateSnapshot): string {
  if (snapshot.qualityReport?.passed) {
    return "Selected the source-valid, quality-passed, layout-qualified candidate.";
  }
  return "Selected by source, layout, repair-count, JD coverage, diversity, and target-distance lexicographic order.";
}
