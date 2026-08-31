import type {
  MatchDimensionScore,
  MatchGap,
  MatchHighlight,
} from "../../../match/types.js";

export type MatchReportTier = "excellent" | "good" | "moderate" | "weak";

export interface MatchReportArtifactData {
  reportId: string;
  jdId: string;
  jdTitle: string;
  jdCompany: string | null;
  finalScore: number;
  tier: MatchReportTier;
  dimensions: MatchDimensionScore[];
  highlights: MatchHighlight[];
  gaps: MatchGap[];
  coverageRatio: number;
  evidenceCompleteness: number;
  generatedAt: string;
  expired: boolean;
  anchorMessageId?: string;
}

export interface JdArtifactRequirement {
  text: string;
  category: string;
  importance: string;
}

export interface JdArtifactData {
  proposalId: string;
  approvalRequestId: string;
  title: string;
  company: string | null;
  targetRole: string | null;
  sourceKind: import("../../../jd/source.js").JdSourceKind;
  sourceUrl: string | null;
  requirements: JdArtifactRequirement[];
  status: "pending" | "saved" | "rejected";
  createdAt: string;
  anchorMessageId?: string;
  jdId?: string;
}
