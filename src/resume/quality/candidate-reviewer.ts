import { isBetterCandidate } from "../workspace/candidate-ranking.js";
import { ResumeWorkspaceError } from "../workspace/errors.js";
import type { ResumeWorkspace } from "../workspace/types.js";
import { ResumeWorkspaceStore } from "../workspace/workspace-store.js";
import { applyQualityMetadata, statusAfterQualityReview } from "./quality-state.js";
import { ResumeQualityEvaluator } from "./quality-evaluator.js";

export class ResumeCandidateReviewer {
  public constructor(
    private readonly evaluator: ResumeQualityEvaluator,
    private readonly store: ResumeWorkspaceStore,
  ) {}

  public review(
    candidateId: string,
    expectedRevision: number,
  ): ResumeWorkspace {
    const current = this.store.get(candidateId);
    if (current.revision !== expectedRevision) {
      throw new ResumeWorkspaceError(
        "stale_candidate_revision",
        `Candidate revision changed from ${expectedRevision} to ${current.revision}.`,
      );
    }
    if (current.qualityReviewStarted) {
      throw new ResumeWorkspaceError(
        "quality_review_already_started",
        "Quality review already started for this candidate.",
      );
    }
    if (current.status !== "layout_qualified") {
      throw new ResumeWorkspaceError(
        "quality_review_requires_layout",
        "G4 quality review requires a G3 layout-qualified candidate.",
      );
    }
    const qualityReport = this.evaluator.evaluate(
      current.sourceSnapshot,
      current.structure,
      current.bindings,
      current.compileResult,
    );
    const status = statusAfterQualityReview(qualityReport, current.repairRound);
    const structure = applyQualityMetadata(current.structure, qualityReport, status);
    const reviewedSnapshot = {
      revision: current.revision,
      structure: structuredClone(structure),
      bindings: structuredClone(current.bindings),
      compileResult: structuredClone(current.compileResult),
      qualityReport: structuredClone(qualityReport),
    };
    const previousBestReport = this.evaluator.evaluate(
      current.sourceSnapshot,
      current.bestSnapshot.structure,
      current.bestSnapshot.bindings,
      current.bestSnapshot.compileResult,
    );
    const reviewedPreviousBest = {
      ...structuredClone(current.bestSnapshot),
      structure: applyQualityMetadata(
        current.bestSnapshot.structure,
        previousBestReport,
        statusAfterQualityReview(previousBestReport, current.repairRound),
      ),
      qualityReport: previousBestReport,
    };
    const bestSnapshot = isBetterCandidate(reviewedSnapshot, reviewedPreviousBest)
      ? reviewedSnapshot
      : reviewedPreviousBest;
    return this.store.replace(
      {
        ...current,
        status,
        structure,
        qualityReviewStarted: true,
        qualityReport,
        bestSnapshot,
      },
      expectedRevision,
    );
  }
}
