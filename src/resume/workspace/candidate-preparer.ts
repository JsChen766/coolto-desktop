import { randomUUID } from "node:crypto";

import type { ResumeSourceSnapshotBuilder } from "../source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../template-contract.js";
import type { BulletEvidenceBinding } from "../source-types.js";
import { applyCandidatePatch } from "./candidate-patch.js";
import { buildResumeSkeleton } from "./candidate-skeleton.js";
import type { ResumeCompiler } from "./compiler-port.js";
import { ResumeWorkspaceError } from "./errors.js";
import { resolveInitialBindingsBestEffort } from "./evidence-resolution.js";
import type {
  PrepareResumeCandidateInput,
  ResumePatchOperation,
  ResumeWorkspace,
} from "./types.js";
import { ResumeWorkspaceStore } from "./workspace-store.js";
import { deriveWorkspaceStatus } from "./workspace-status.js";

export interface ResumeCandidatePreparerOptions {
  createCandidateId?: () => string;
  /** Maximum bullet height in lines (2 or 3). Defaults to 3. */
  maxBulletLines?: 2 | 3;
}

export class ResumeCandidatePreparer {
  public constructor(
    private readonly snapshotBuilder: ResumeSourceSnapshotBuilder,
    private readonly compiler: ResumeCompiler,
    private readonly store: ResumeWorkspaceStore,
    private readonly options: ResumeCandidatePreparerOptions = {},
  ) {}

  public async prepare(
    input: PrepareResumeCandidateInput,
    signal?: AbortSignal,
  ): Promise<ResumeWorkspace> {
    const snapshot = await this.snapshotBuilder.build(
      {
        jdId: input.jdId,
        experienceIds: input.experienceIds,
        template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
      },
      signal,
    );
    const skeleton = buildResumeSkeleton(
      snapshot,
      input.experienceIds,
      input.language,
    );
    const draft = input.initialBindings?.length
      ? resolveInitialBindingsBestEffort(snapshot, input.initialBindings)
      : { bindings: [] as BulletEvidenceBinding[], rejected: [], repairs: [] };
    const initial = draft.bindings.length
      ? applyCandidatePatch(
          snapshot,
          skeleton,
          [],
          initialOperations(skeleton, draft.bindings),
        )
      : { structure: skeleton, bindings: [] };
    const compileResult = await this.compiler.compile(initial.structure);
    const operationReport =
      draft.rejected.length || draft.repairs.length
        ? { repairs: draft.repairs, rejected: draft.rejected }
        : undefined;
    const workspace: ResumeWorkspace = {
      candidateId:
        this.options.createCandidateId?.() ?? `resume-candidate-${randomUUID()}`,
      revision: 0,
      patchCount: 0,
      status: deriveWorkspaceStatus(compileResult, initial.structure),
      sourceSnapshot: snapshot,
      structure: initial.structure,
      bindings: initial.bindings,
      compileResult,
      qualityReviewStarted: false,
      maxBulletLines: this.options.maxBulletLines ?? 3,
      repairRound: 0,
      repairHistory: [],
      ...(operationReport ? { lastOperationReport: operationReport } : {}),
      bestSnapshot: {
        revision: 0,
        structure: structuredClone(initial.structure),
        bindings: structuredClone(initial.bindings),
        compileResult: structuredClone(compileResult),
      },
    };
    return this.store.create(workspace);
  }
}

function initialOperations(
  structure: ResumeWorkspace["structure"],
  bindings: BulletEvidenceBinding[],
): ResumePatchOperation[] {
  return bindings.map((binding) => ({
    op: "add_bullet",
    itemId: itemIdForSource(structure, binding.sourceExperienceId),
    binding,
  }));
}

function itemIdForSource(
  structure: ResumeWorkspace["structure"],
  sourceExperienceId: string,
): string {
  for (const section of structure.sections) {
    const item = section.items.find(
      (candidate) =>
        candidate.source_experience_id === sourceExperienceId.trim(),
    );
    if (item) return item.id;
  }
  throw new ResumeWorkspaceError(
    "item_not_found",
    `No resume item exists for source experience ${sourceExperienceId}.`,
  );
}
