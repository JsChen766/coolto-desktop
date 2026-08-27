export type ResumeMaterialRequestKind =
  | "agent_declared"
  | "critical_skill"
  | "bullet_count_insufficient"
  | "page_fill_stalled"
  | "line_rewrite_stalled"
  | "tail_repair_stalled";

export type ResumeMaterialRequestStatus = "awaiting_response" | "declined";

export type ResumeMaterialRequestResolution =
  | "user_stopped_questions"
  | "best_effort_stalled";

export interface ResumeMaterialRequest {
  /** Optional only for drafts created before request identities existed. */
  id?: string;
  kind?: ResumeMaterialRequestKind;
  reason: string;
  question: string;
  targetExperienceId?: string;
  requestedAt: string;
  discoveryStage?: "guidance" | "scenario_probe" | "follow_up";
  firstUnableMessageTimestamp?: number;
  scenarioQuestions?: string[];
  /** Missing on legacy drafts and interpreted as awaiting_response. */
  status?: ResumeMaterialRequestStatus;
  respondedAt?: string;
  sourceMessageTimestamp?: number;
  resolution?: ResumeMaterialRequestResolution;
}

export interface ResumeMaterialFollowUpPending {
  sourceRequestKind: ResumeMaterialRequestKind;
  targetExperienceId: string;
}
