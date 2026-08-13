import { ResumeWorkspaceError } from "../workspace/errors.js";
import type {
  RepairResumeCandidateInput,
  ResumePatchOperationInput,
  ResumeWorkspace,
} from "../workspace/types.js";

export const MAX_REPAIR_ROUNDS = 3;

/**
 * Validates a repair request against the current workspace and the bounded
 * alternative contract before any candidate is compiled.
 */
export function validateRequest(
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
      "Quality review must run before submitting quality alternatives.",
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

/**
 * Ensures a repair alternative only touches the reported target region and
 * never modifies frozen bullets.
 */
export function assertFrozenRegions(
  workspace: ResumeWorkspace,
  target: NonNullable<ResumeWorkspace["qualityReport"]>["repairTargets"][number],
  operations: readonly ResumePatchOperationInput[],
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
