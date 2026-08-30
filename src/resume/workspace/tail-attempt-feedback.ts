export interface TailAttemptFeedback {
  failureType:
    | "insufficient_growth"
    | "line_count_increased"
    | "invalid_content";
  actualGrowthCjk: number;
  remainingToHardCjk: number;
  remainingToIdealCjk: number;
  excessOverMaximumCjk: number;
  requiredDirection: "increase" | "decrease" | "reflow";
}
