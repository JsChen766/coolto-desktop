export type CapabilityStage =
  | "observe"
  | "prepare"
  | "approved_action"
  | "reconcile"
  | "wait";

export const CAPABILITY_STAGES: readonly CapabilityStage[] = [
  "observe", "prepare", "approved_action", "reconcile", "wait",
];
