export type UpdateTrigger = "manual" | "silent";

export type UpdateErrorStage = "check" | "install";

export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

export interface AppUpdateState {
  phase: AppUpdatePhase;
  currentVersion: string;
  /** Target version discovered in the feed, if any. */
  updateVersion: string | null;
  /** Download progress 0–100 while downloading. */
  percent: number | null;
  /** Error message while in error phase. */
  message: string | null;
  /** Whether the error happened while checking or while installing. */
  errorStage: UpdateErrorStage | null;
}

export type UpdateStateEvent =
  | { type: "checking" }
  | { type: "not-available" }
  | { type: "available"; version: string }
  | { type: "download-progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "installing" }
  | { type: "error"; message: string; stage: UpdateErrorStage };
