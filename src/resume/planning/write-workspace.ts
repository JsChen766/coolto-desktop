import { allEvidenceCandidates } from "../quality/evidence-candidates.js";
import type { ResumeSourceSnapshot } from "../source-types.js";
import { applyCandidatePatch } from "../workspace/candidate-patch.js";
import { buildResumeSkeleton } from "../workspace/candidate-skeleton.js";
import type { ResumeWorkspace } from "../workspace/types.js";
import { deriveWorkspaceStatus } from "../workspace/workspace-status.js";
import { bindingsFromPlan } from "./planner.js";
import type { WritingPlan } from "./planner.js";
import { fillToGate } from "./fill-to-gate.js";
import type { PlannedResumeWriteInput, PlannedResumeWriterOptions } from "./planned-resume-writer.js";
import type { BulletWritingRequest } from "./parallel-writer.js";

/**
 * Assembles the workspace from a plan: maps each planned bullet to a
 * concurrent writing request, binds the returned texts to the evidence,
 * runs the EvidenceLedger and a real compile, then fills the last mile
 * (tail/line/section) deterministically before storing.
 */
export async function writeWorkspace(
  options: PlannedResumeWriterOptions,
  input: PlannedResumeWriteInput,
  snapshot: ResumeSourceSnapshot,
  plan: WritingPlan,
): Promise<ResumeWorkspace> {
  const candidateMap = new Map(
    allEvidenceCandidates(snapshot).map((candidate) => [
      candidate.evidenceId,
      candidate,
    ]),
  );
  const requests: BulletWritingRequest[] = plan.bullets.map((bullet) => ({
    bulletIndex: bullet.bulletIndex,
    itemId: bullet.itemId,
    experienceId: bullet.experienceId,
    evidence: bullet.evidenceIds.map((evidenceId) => {
      const candidate = candidateMap.get(evidenceId);
      if (!candidate) {
        throw new Error(`Plan references unknown evidence ${evidenceId}`);
      }
      return candidate;
    }),
    targetChars: bullet.targetChars,
    language: input.language,
  }));
  const results = await options.bulletWriter.writeAll(requests);
  const textByBullet = new Map(
    results.map((result) => [result.bulletIndex, result.bulletText]),
  );
  const bindings = bindingsFromPlan(snapshot, plan).map((binding, index) => ({
    ...binding,
    bulletText: textByBullet.get(index) ?? "",
    ...(plan.bullets[index]?.itemId === "item-skills-synthetic"
      ? { sharedEvidence: true }
      : {}),
  }));
  const skeleton = buildResumeSkeleton(snapshot, input.experienceIds, input.language);
  const patched = applyCandidatePatch(
    snapshot,
    skeleton,
    [],
    bindings.map((binding, index) => ({
      op: "add_bullet" as const,
      itemId: plan.bullets[index]?.itemId ?? `item-${binding.sourceExperienceId}`,
      binding,
    })),
  );
  const compileResult = await options.compiler.compile(patched.structure);
  const filled = await fillToGate(
    options.compiler,
    snapshot,
    patched.structure,
    patched.bindings,
    compileResult,
  );
  const workspace: ResumeWorkspace = {
    candidateId: `planned-${Date.now()}`,
    revision: 0,
    patchCount: 0,
    status: deriveWorkspaceStatus(filled.compileResult, filled.structure),
    sourceSnapshot: snapshot,
    structure: filled.structure,
    bindings: filled.bindings,
    compileResult: filled.compileResult,
    qualityReviewStarted: false,
    repairRound: 0,
    repairHistory: [],
    maxBulletLines: options.maxBulletLines ?? 3,
    bestSnapshot: {
      revision: 0,
      structure: structuredClone(filled.structure),
      bindings: structuredClone(filled.bindings),
      compileResult: structuredClone(filled.compileResult),
    },
  };
  return options.store.create(workspace);
}
