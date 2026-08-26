export type ResumeMaterialRequestKind =
  | "agent_declared"
  | "critical_skill"
  | "bullet_count_insufficient"
  | "page_fill_stalled"
  | "tail_repair_stalled";

export interface ResumeMaterialRequest {
  kind?: ResumeMaterialRequestKind;
  reason: string;
  question: string;
  targetExperienceId?: string;
  requestedAt: string;
  discoveryStage?: "guidance" | "scenario_probe";
  firstUnableMessageTimestamp?: number;
  scenarioQuestions?: string[];
}
