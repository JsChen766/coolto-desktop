import type { ResumeCompileResult } from "../compiler-types.js";
import type {
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
} from "../source-types.js";
import type { ResumeStructure } from "../types.js";
import type {
  RepairRoundDiagnostic,
  ResumeAlternativeTargetInput,
  ResumeQualityReport,
} from "../quality/types.js";
import type { EvidenceRepairAction } from "./evidence-auto-repair.js";

export type ResumeCandidateLanguage = "zh-CN" | "en-US";
export type ResumeWorkspaceStatus =
  | "writing"
  | "needs_revision"
  | "layout_qualified"
  | "ready_for_approval"
  | "needs_user_decision";

export interface ResumeCandidateSnapshot {
  revision: number;
  structure: ResumeStructure;
  bindings: BulletEvidenceBinding[];
  compileResult: ResumeCompileResult;
  qualityReport?: ResumeQualityReport;
}

export interface ResumeOperationReport {
  repairs: EvidenceRepairAction[];
  rejected: Array<{ index: number; message: string }>;
}

export interface ResumeWorkspace {
  candidateId: string;
  revision: number;
  patchCount: number;
  status: ResumeWorkspaceStatus;
  sourceSnapshot: ResumeSourceSnapshot;
  structure: ResumeStructure;
  bindings: BulletEvidenceBinding[];
  compileResult: ResumeCompileResult;
  bestSnapshot: ResumeCandidateSnapshot;
  qualityReviewStarted: boolean;
  repairRound: number;
  repairHistory: RepairRoundDiagnostic[];
  qualityReport?: ResumeQualityReport;
  lastOperationReport?: ResumeOperationReport;
}

export interface PrepareResumeCandidateInput {
  jdId: string;
  experienceIds: string[];
  language: ResumeCandidateLanguage;
  initialBindings?: EvidenceBindingInput[];
}

/**
 * Model-facing binding input: the model only authors the bullet text and
 * cites stable `evidenceId` values from the latest `availableEvidence`. The
 * host derives the source experience, assigns a stable bullet ID, and fills
 * `matchedRequirementIds` from the cited candidates before validation.
 */
export interface EvidenceBindingInput {
  bulletText: string;
  evidenceIds: readonly string[];
}

export type ResumePatchOperationInput =
  | {
      op: "add_bullet";
      itemId: string;
      afterBulletId?: string | null;
      binding: EvidenceBindingInput;
    }
  | {
      op: "replace_bullet";
      bulletId: string;
      binding: EvidenceBindingInput;
    }
  | { op: "remove_bullet"; bulletId: string }
  | {
      op: "move_bullet";
      bulletId: string;
      afterBulletId?: string | null;
    }
  | {
      op: "append_text";
      bulletId: string;
      text: string;
      evidenceIds: readonly string[];
    }
  | {
      op: "prepend_text";
      bulletId: string;
      text: string;
      evidenceIds: readonly string[];
    }
  | {
      op: "insert_text";
      bulletId: string;
      after: string;
      text: string;
      evidenceIds: readonly string[];
    }
  | {
      op: "replace_substring";
      bulletId: string;
      from: string;
      to: string;
      evidenceIds: readonly string[];
    }
  | { op: "trim_text"; bulletId: string; keepChars: number };

export type ResumePatchOperation =
  | {
      op: "add_bullet";
      itemId: string;
      afterBulletId?: string | null;
      binding: BulletEvidenceBinding;
    }
  | {
      op: "replace_bullet";
      bulletId: string;
      binding: BulletEvidenceBinding;
    }
  | { op: "remove_bullet"; bulletId: string }
  | {
      op: "move_bullet";
      bulletId: string;
      afterBulletId?: string | null;
    };

export interface PatchResumeCandidateInput {
  candidateId: string;
  expectedRevision: number;
  operations: ResumePatchOperationInput[];
}

export interface RepairResumeCandidateInput {
  candidateId: string;
  expectedRevision: number;
  alternativeTargets: ResumeAlternativeTargetInput[];
}

export interface ResumeBudgetDiagnostic {
  usedHeightPx: number;
  availableHeightPx: number;
  usageRatio: number;
  pxToMinimum: number;
  pxToTarget: number;
  pxBeforeOverflow: number;
  bodyLineHeightPx: number;
  estimatedBodyLinesRemaining: number;
}
