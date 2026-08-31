export interface AiNativeArtifactBaseV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  dedupeKey: string;
  contentHash: string;
  createdAt: string;
}

export interface FollowUpDraftArtifactV1 extends AiNativeArtifactBaseV1 {
  kind: "follow_up_draft";
  applicationId: string;
  subject: string;
  body: string;
  scheduledFor: string;
  timezone: string;
}

export interface InterviewBriefArtifactV1 extends AiNativeArtifactBaseV1 {
  kind: "interview_brief";
  applicationId: string;
  interviewId: string;
  title: string;
  sections: Array<{
    heading: string;
    content: string;
    sourceRefs: string[];
  }>;
}

export interface StrategyProposalArtifactV1 extends AiNativeArtifactBaseV1 {
  kind: "strategy_proposal";
  snapshotHash: string;
  title: string;
  summary: string;
  recommendations: string[];
  caveat: string;
}

export interface RiskNoticeArtifactV1 extends AiNativeArtifactBaseV1 {
  kind: "risk_notice";
  applicationId: string | null;
  severity: "review" | "high";
  title: string;
  rationale: string;
  evidenceQuotes: string[];
  deadlineAt: string | null;
}

export type AiNativeArtifactV1 =
  | FollowUpDraftArtifactV1
  | InterviewBriefArtifactV1
  | StrategyProposalArtifactV1
  | RiskNoticeArtifactV1;

type DraftOf<T> = T extends AiNativeArtifactV1
  ? Omit<T, "version" | "id" | "ownerId" | "contentHash" | "createdAt">
  : never;

export type AiNativeArtifactDraft = DraftOf<AiNativeArtifactV1>;
