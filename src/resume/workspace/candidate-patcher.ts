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

const MAX_PATCH_COUNT = 160;

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
    if (
      current.status === "ready_for_approval" ||
      current.status === "needs_user_decision"
    ) {
      throw new ResumeWorkspaceError(
        "workspace_terminal",
        `Candidate is terminal with status ${current.status}.`,
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
    // Overflow is reported to the agent as page_overflow / multiple_pages and
    // the agent trims it back itself. The host never removes sections: a
    // deleted section (e.g. skills) would disappear permanently even after
    // the page shrinks again.
    const compileResult = await this.compiler.compile(patched.structure);
    const revision = current.revision + 1;
    const candidateSnapshot: ResumeCandidateSnapshot = {
      revision,
      structure: structuredClone(patched.structure),
      bindings: structuredClone(patched.bindings),
      compileResult: structuredClone(compileResult),
    };
    const bestSnapshot = isBetterCandidate(
      candidateSnapshot,
      current.bestSnapshot,
    )
      ? candidateSnapshot
      : current.bestSnapshot;
    const operationReport = {
      status: resolution.rejected.length
        ? ("partial_success" as const)
        : ("success" as const),
      attempted: input.operations.length,
      applied: resolution.resolved.length,
      repairs: resolution.repairs,
      rejected: resolution.rejected,
    };
    return this.store.replace(
      {
        ...current,
        revision,
        patchCount: current.patchCount + 1,
        status: deriveWorkspaceStatus(
          compileResult,
          patched.structure,
          {
            sourceSnapshot: current.sourceSnapshot,
            bindings: patched.bindings,
          },
        ),
        structure: patched.structure,
        bindings: patched.bindings,
        compileResult,
        bestSnapshot,
        lastOperationReport: operationReport,
      },
      input.expectedRevision,
    );
  }
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
