import { applyCandidatePatch } from "./candidate-patch.js";
import type { ResumeCompiler } from "./compiler-port.js";
import { ResumeWorkspaceError } from "./errors.js";
import { isBetterCandidate } from "./candidate-ranking.js";
import type {
  PatchResumeCandidateInput,
  ResumeCandidateSnapshot,
  ResumeWorkspace,
} from "./types.js";
import { ResumeWorkspaceStore } from "./workspace-store.js";
import { deriveWorkspaceStatus } from "./workspace-status.js";

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
    if (current.patchCount >= MAX_PATCH_COUNT) {
      throw new ResumeWorkspaceError(
        "workspace_revision_limit",
        `Candidate reached the ${MAX_PATCH_COUNT}-patch safety limit.`,
      );
    }
    const patched = applyCandidatePatch(
      current.sourceSnapshot,
      current.structure,
      current.bindings,
      input.operations,
    );
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
    return this.store.replace(
      {
        ...current,
        revision,
        patchCount: current.patchCount + 1,
        status: deriveWorkspaceStatus(compileResult, patched.structure),
        structure: patched.structure,
        bindings: patched.bindings,
        compileResult,
        bestSnapshot,
      },
      input.expectedRevision,
    );
  }
}
