import type { ResumeCompileResult } from "../compiler-types.js";
import type {
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
} from "../source-types.js";
import type { ResumeStructure } from "../types.js";

export type ResumeCandidateLanguage = "zh-CN" | "en-US";
export type ResumeWorkspaceStatus =
  | "writing"
  | "needs_revision"
  | "layout_qualified";

export interface ResumeCandidateSnapshot {
  revision: number;
  structure: ResumeStructure;
  bindings: BulletEvidenceBinding[];
  compileResult: ResumeCompileResult;
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
}

export interface PrepareResumeCandidateInput {
  jdId: string;
  experienceIds: string[];
  language: ResumeCandidateLanguage;
  initialBindings?: BulletEvidenceBinding[];
}

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
  operations: ResumePatchOperation[];
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
