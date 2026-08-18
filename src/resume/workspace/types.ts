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
import type { TailRepairRetryState } from "./tail-repair-state.js";

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
  status: "success" | "partial_success";
  attempted: number;
  applied: number;
  repairs: EvidenceRepairAction[];
  rejected: Array<{ index: number; message: string }>;
}

/**
 * 生成前由真实 Chromium 布局测量得到的物理预算：write_bullet 的默认
 * targetChars 和指令提示都以此动态给出，首稿长度不再依赖固定默认区间。
 */
export interface ResumeLayoutBudget {
  /** 每行真实字符数（真实 Chromium 测量）。 */
  charsPerLine: number;
  /** 达到最低占用率所需的 bullet 行数（固定行已扣除）。 */
  requiredBulletLinesAtMinimum: number;
  /** 所选经历的可写 bullet 容量（一条独立证据可写一条 bullet，不按类别写死）。 */
  writableBulletCapacity: number;
  maxBulletLines: 2 | 3;
}

export interface ResumeWorkspace {
  candidateId: string;
  revision: number;
  patchCount: number;
  /** Number of complete-content writes since the latest source selection. */
  contentApplyCount?: number;
  status: ResumeWorkspaceStatus;
  sourceSnapshot: ResumeSourceSnapshot;
  structure: ResumeStructure;
  bindings: BulletEvidenceBinding[];
  compileResult: ResumeCompileResult;
  /** Revision whose exact structure produced compileResult. */
  compileObservedRevision?: number;
  bestSnapshot: ResumeCandidateSnapshot;
  qualityReviewStarted: boolean;
  repairRound: number;
  repairHistory: RepairRoundDiagnostic[];
  qualityReport?: ResumeQualityReport;
  lastOperationReport?: ResumeOperationReport;
  /** Maximum bullet height in lines (2 or 3); defaults to 3. */
  maxBulletLines?: 2 | 3;
  /** 真实版面物理预算（prepare 阶段测定），write_bullet 动态 target 的数据源。 */
  layoutBudget?: ResumeLayoutBudget;
  /** 规则 6：Agent 补充的特质内容（无证据来源，依据 JD 要求）。 */
  augmentedBullets?: Array<{
    bulletId: string;
    jdRequirementText: string;
    summary: string;
  }>;
  /** 规则 6：补充内容待用户确认；用户确认后清除视为定稿。 */
  awaitingUserConfirmation?: { note: string } | null;
  /** Agent 为已有事实 bullet 添加的无直接证据修饰语，按片段确认或回退。 */
  augmentedFragments?: ResumeAugmentedFragment[];
  /** Agent declares relevance tiers; the host only enforces their counts. */
  itemTiers?: Record<string, ResumeItemTier>;
  /** Provenance for the current complete bullet lists. */
  bulletProvenance?: ResumeBulletProvenance[];
  /** User-provided facts added after the immutable source snapshot was locked. */
  supplementalEvidence?: ResumeSupplementalEvidence[];
  /** Material pause declared by the Agent or a deterministic host gate. */
  materialRequest?: {
    kind?: "agent_declared" | "critical_skill" | "page_fill_stalled";
    reason: string;
    question: string;
    targetExperienceId?: string;
    requestedAt: string;
  };
  /** Mechanical attempt ledger after a zero-progress tail-repair measurement. */
  tailRepairRetry?: TailRepairRetryState;
  /** Consecutive measured page-fill rounds that landed no real height growth. */
  pageFillProgress?: {
    consecutiveZeroGrowthRounds: number;
  };
}

export type ResumeItemTier = "main" | "secondary" | "utility";
export type ResumeBulletOrigin = "grounded" | "agent_augmented";
export type ResumeBulletConfirmation =
  | "not_required"
  | "pending"
  | "confirmed";

export interface ResumeBulletProvenance {
  bulletId: string;
  itemId: string;
  origin: ResumeBulletOrigin;
  evidenceIds: string[];
  requirementIds: string[];
  confirmation: ResumeBulletConfirmation;
}

export interface ResumeAugmentedFragment {
  bulletId: string;
  baseText: string;
  fragmentText: string;
  appliedText: string;
  requirementIds: string[];
  confirmation: Exclude<ResumeBulletConfirmation, "not_required">;
}

export interface ResumeSupplementalEvidence {
  evidenceId: string;
  experienceId: string;
  text: string;
  sourceMessageTimestamp: number;
  createdAt: string;
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
