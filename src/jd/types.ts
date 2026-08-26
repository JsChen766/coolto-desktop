/**
 * JD proposal contract — shared across Agent, Executor, and UI layers.
 *
 * JdProposal is an immutable local candidate produced by the Agent after
 * extracting structure from pasted JD text. It becomes a cloud JdRecord only
 * after the user accepts it through the host approval flow.
 */

import type {
  JdRequirementImportance,
  JdRequirementV2Category,
  JdRequirementV2Importance,
} from "../api/types.js";
import type { JdSourceKind } from "./source.js";

// ---------------------------------------------------------------------------
// Proposal requirement — server assigns stable `id` after creation, so the
// proposal carries a client-generated provisional ID only.
// ---------------------------------------------------------------------------

export interface JdProposalRequirement {
  clientId: string;
  text: string;
  category: string;
  importance: JdRequirementImportance;
  keywords: string[];
  v2Importance: JdRequirementV2Importance | null;
  v2Category: JdRequirementV2Category | null;
}

// ---------------------------------------------------------------------------
// Duplicate status — P0 always `none`; field reserved for future dedup.
// ---------------------------------------------------------------------------

export type JdDuplicateStatus = "none" | "exact" | "similar";

// ---------------------------------------------------------------------------
// JdProposal — the immutable candidate shown to the user for approval.
// ---------------------------------------------------------------------------

export interface JdProposal {
  id: string;
  rawText: string;
  title: string;
  company: string | null;
  targetRole: string | null;
  sourceKind: JdSourceKind;
  sourceUrl: string | null;
  requirements: JdProposalRequirement[];
  duplicateStatus: JdDuplicateStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Approval payload — the exact data the Executor sends to POST /product/jds.
// ---------------------------------------------------------------------------

export interface JdSaveApprovalPayload {
  proposalId: string;
  rawText: string;
  title: string;
  company: string | null;
  targetRole: string | null;
  sourceKind: JdSourceKind;
  sourceUrl: string | null;
  requirements: JdProposalRequirement[];
  idempotencyKey: string;
}
