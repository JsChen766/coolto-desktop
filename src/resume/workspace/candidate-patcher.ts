import { applyCandidatePatch } from "./candidate-patch.js";
import { EvidenceValidationError } from "../evidence-validation.js";
import type { ResumeCompiler } from "./compiler-port.js";
import { ResumeWorkspaceError } from "./errors.js";
import { resolveOperationsBestEffort } from "./evidence-resolution.js";
import { isBetterCandidate } from "./candidate-ranking.js";
import type {
  PatchResumeCandidateInput,
  ResumeCandidateSnapshot,
  ResumeWorkspace,
} from "./types.js";
import { ResumeWorkspaceStore } from "./workspace-store.js";
import { deriveWorkspaceStatus } from "./workspace-status.js";
import { degradeAdditionalSections } from "./section-space-policy.js";

const MAX_PATCH_COUNT = 40;

export class ResumeCandidatePatcher {
  public constructor(
    private readonly compiler: ResumeCompiler,
    private readonly store: ResumeWorkspaceStore,
  ) {}

  public async patch(input: PatchResumeCandidateInput): Promise<ResumeWorkspace> {
    const current = this.store.get(input.candidateId);
    if (current.revision !== input.expectedRevision) {
      throw new ResumeWorkspaceError(
        "stale_candidate_revision",
        `Candidate revision changed from ${input.expectedRevision} to ${current.revision}.`,
      );
    }
    if (current.qualityReviewStarted) {
      throw new ResumeWorkspaceError(
        "quality_repair_requires_alternatives",
        "Quality review has started; use bounded alternativeTargets instead of a direct patch.",
      );
    }
    if (current.patchCount >= MAX_PATCH_COUNT) {
      throw new ResumeWorkspaceError(
        "workspace_revision_limit",
        `Candidate reached the ${MAX_PATCH_COUNT}-patch safety limit.`,
      );
    }
    const resolution = resolveOperationsBestEffort(
      current.sourceSnapshot,
      current.structure,
      current.bindings,
      input.operations,
    );
    if (!resolution.resolved.length) {
      throw new ResumeWorkspaceError(
        "invalid_patch_operation",
        `All ${resolution.rejected.length} operations were rejected: ${resolution.rejected
          .map((rejected) => rejected.message)
          .join("; ")}`,
      );
    }
    let patched: ReturnType<typeof applyCandidatePatch>;
    try {
      patched = applyCandidatePatch(
        current.sourceSnapshot,
        current.structure,
        current.bindings,
        resolution.resolved,
      );
    } catch (error) {
      if (
        error instanceof EvidenceValidationError &&
        error.code === "duplicate_source_range"
      ) {
        throw new ResumeWorkspaceError(
          "invalid_patch_operation",
          `${error.message} [resolved batch ranges: ${summarizeResolvedRanges(
            resolution.resolved,
          )}]`,
        );
      }
      throw error;
    }
    const compileResult = await this.compiler.compile(patched.structure);
    const degraded = hasOverflow(compileResult)
      ? degradeAdditionalSections(patched.structure, patched.bindings)
      : { ...patched, removedSectionIds: [] };
    const finalCompile = degraded.removedSectionIds.length
      ? await this.compiler.compile(degraded.structure)
      : compileResult;
    const revision = current.revision + 1;
    const candidateSnapshot: ResumeCandidateSnapshot = {
      revision,
      structure: structuredClone(degraded.structure),
      bindings: structuredClone(degraded.bindings),
      compileResult: structuredClone(finalCompile),
    };
    const bestSnapshot = isBetterCandidate(
      candidateSnapshot,
      current.bestSnapshot,
    )
      ? candidateSnapshot
      : current.bestSnapshot;
    const operationReport =
      resolution.rejected.length || resolution.repairs.length
        ? {
            repairs: resolution.repairs,
            rejected: resolution.rejected,
          }
        : undefined;
    return this.store.replace(
      {
        ...current,
        revision,
        patchCount: current.patchCount + 1,
        status: deriveWorkspaceStatus(finalCompile, degraded.structure),
        structure: degraded.structure,
        bindings: degraded.bindings,
        compileResult: finalCompile,
        bestSnapshot,
        ...(operationReport ? { lastOperationReport: operationReport } : {}),
      },
      input.expectedRevision,
    );
  }
}

function hasOverflow(result: ResumeWorkspace["compileResult"]): boolean {
  return result.violations.some((violation) =>
    violation.code === "page_overflow" || violation.code === "multiple_pages",
  );
}

function summarizeResolvedRanges(
  resolved: ReturnType<typeof resolveOperationsBestEffort>["resolved"],
): string {
  return resolved
    .map((operation) => {
      if (operation.op === "replace_bullet") {
        return `${operation.bulletId}=[${summarizeExcerpts(operation.binding)}]`;
      }
      if (operation.op === "add_bullet") {
        return `${operation.binding.bulletId}=[${summarizeExcerpts(operation.binding)}]`;
      }
      return operation.op;
    })
    .join("; ");
}

function summarizeExcerpts(
  binding: Extract<
    ReturnType<typeof resolveOperationsBestEffort>["resolved"][number],
    { op: "replace_bullet" }
  >["binding"],
): string {
  return binding.excerpts
    .map(
      (excerpt) =>
        `${excerpt.experienceId}:${excerpt.sourceStart}-${excerpt.sourceEnd}`,
    )
    .join(",");
}
