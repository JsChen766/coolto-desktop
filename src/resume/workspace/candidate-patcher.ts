import { applyCandidatePatch } from "./candidate-patch.js";
import type { ResumeCompiler } from "./compiler-port.js";
import { ResumeWorkspaceError } from "./errors.js";
import { resolveOperations } from "./evidence-resolution.js";
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
    const resolvedOperations = resolveOperations(
      current.sourceSnapshot,
      current.structure,
      current.bindings,
      input.operations,
    );
    const patched = applyCandidatePatch(
      current.sourceSnapshot,
      current.structure,
      current.bindings,
      resolvedOperations,
    );
    const overflow = await this.compiler.compile(patched.structure);
    const degraded = hasOverflow(overflow)
      ? degradeAdditionalSections(patched.structure, patched.bindings)
      : { ...patched, removedSectionIds: [] };
    const compileResult = degraded.removedSectionIds.length
      ? await this.compiler.compile(degraded.structure)
      : overflow;
    const revision = current.revision + 1;
    const candidateSnapshot: ResumeCandidateSnapshot = {
      revision,
      structure: structuredClone(degraded.structure),
      bindings: structuredClone(degraded.bindings),
      compileResult: structuredClone(compileResult),
    };
    const bestSnapshot = isBetterCandidate(
      candidateSnapshot,
      current.bestSnapshot,
    )
      ? candidateSnapshot
      : current.bestSnapshot;
    return this.store.replace(
      {
        ...current,
        revision,
        patchCount: current.patchCount + 1,
        status: deriveWorkspaceStatus(compileResult, degraded.structure),
        structure: degraded.structure,
        bindings: degraded.bindings,
        compileResult,
        bestSnapshot,
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
