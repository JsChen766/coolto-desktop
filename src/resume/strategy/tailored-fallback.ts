import type { OutputRepetitionReason } from "../../agent/output-repetition-guard.js";
import type { TurnGovernorStopReason } from "../../agent/turn-governor.js";
import { resumeGenerationReadiness } from "../workspace/generation-readiness.js";
import type { ResumeWorkspace } from "../workspace/types.js";
import { resumeGenerationStrategy } from "../source-strategy.js";

export interface ResumeStrategyFallbackDecision {
  mode: "choose_resume_strategy";
  options: ["use_general_resume", "stop_application"];
  reason: string;
}

export type ResumeStrategyFallbackStopReason =
  | OutputRepetitionReason
  | TurnGovernorStopReason;

const EVIDENCE_EXHAUSTION_REASONS = new Set<ResumeStrategyFallbackStopReason>([
  "narrative_limit",
  "repeated_cycle",
  "same_tool_outcome",
  "same_tool_sequence",
  "maximum_turns",
  "maximum_phase_turns",
  "maximum_total_turns",
]);

export function tailoredResumeFallbackDecision(
  workspace: ResumeWorkspace | undefined,
  reason: ResumeStrategyFallbackStopReason | undefined,
): ResumeStrategyFallbackDecision | undefined {
  if (
    !workspace ||
    !reason ||
    !EVIDENCE_EXHAUSTION_REASONS.has(reason) ||
    resumeGenerationStrategy(workspace.sourceSnapshot) !== "tailored" ||
    workspace.selectionPolicy === "user_directed" ||
    resumeGenerationReadiness(workspace).ready
  ) return undefined;
  return {
    mode: "choose_resume_strategy",
    options: ["use_general_resume", "stop_application"],
    reason:
      "现有经历暂时无法支持一份可信、与该岗位足够匹配的针对性简历",
  };
}
