import { performance } from "node:perf_hooks";

import { EvidenceValidationError } from "../evidence-ledger.js";
import { applyCandidatePatch } from "../workspace/candidate-patch.js";
import {
  compareCandidateSnapshots,
  isBetterCandidate,
} from "../workspace/candidate-ranking.js";
import type { ResumeCompiler } from "../workspace/compiler-port.js";
import { ResumeWorkspaceError } from "../workspace/errors.js";
import type {
  RepairResumeCandidateInput,
  ResumeCandidateSnapshot,
  ResumePatchOperation,
  ResumeWorkspace,
} from "../workspace/types.js";
import { ResumeWorkspaceStore } from "../workspace/workspace-store.js";
import { applyQualityMetadata, statusAfterQualityReview } from "./quality-state.js";
import { ResumeQualityEvaluator } from "./quality-evaluator.js";

const BEAM_WIDTH = 4;
const MAX_REPAIR_ROUNDS = 3;

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
              alternative.operations,
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

function validateRequest(
  current: ResumeWorkspace,
  input: RepairResumeCandidateInput,
): void {
  if (current.revision !== input.expectedRevision) {
    throw new ResumeWorkspaceError(
      "stale_candidate_revision",
      `Candidate revision changed from ${input.expectedRevision} to ${current.revision}.`,
    );
  }
  if (!current.qualityReviewStarted || !current.qualityReport) {
    throw new ResumeWorkspaceError(
      "invalid_repair_target",
      "Call review_resume_candidate before submitting quality alternatives.",
    );
  }
  if (current.repairRound >= MAX_REPAIR_ROUNDS) {
    throw new ResumeWorkspaceError(
      "repair_round_limit",
      "The candidate already used all three quality repair rounds.",
    );
  }
  if (!input.alternativeTargets.length || input.alternativeTargets.length > 2) {
    throw new ResumeWorkspaceError(
      "invalid_repair_target",
      "A repair round must address one or two reported targets.",
    );
  }
  const validTargets = new Set(
    current.qualityReport.repairTargets.map((target) => target.targetId),
  );
  for (const target of input.alternativeTargets) {
    if (
      !validTargets.has(target.targetId) ||
      target.alternatives.length < 1 ||
      target.alternatives.length > 3 ||
      target.alternatives.some(
        (alternative) =>
          alternative.operations.length < 1 || alternative.operations.length > 3,
      )
    ) {
      throw new ResumeWorkspaceError(
        "invalid_repair_target",
        `Repair target ${target.targetId} violates the bounded alternative contract.`,
      );
    }
  }
}

function assertFrozenRegions(
  workspace: ResumeWorkspace,
  target: NonNullable<ResumeWorkspace["qualityReport"]>["repairTargets"][number],
  operations: readonly ResumePatchOperation[],
): void {
  const frozen = new Set(workspace.qualityReport?.frozenBulletIds ?? []);
  const allowed = new Set(target.bulletIds);
  for (const operation of operations) {
    if (operation.op === "add_bullet") {
      if (
        target.bulletIds.length ||
        (target.itemId !== undefined && operation.itemId !== target.itemId)
      ) {
        throw new ResumeWorkspaceError(
          "invalid_repair_target",
          "A bullet-specific repair target cannot add unrelated content.",
        );
      }
      continue;
    }
    if (frozen.has(operation.bulletId) || !allowed.has(operation.bulletId)) {
      throw new ResumeWorkspaceError(
        "invalid_repair_target",
        `Repair operation attempted to modify frozen bullet ${operation.bulletId}.`,
      );
    }
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
