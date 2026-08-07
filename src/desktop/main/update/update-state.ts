import type {
  AppUpdatePhase,
  AppUpdateState,
  UpdateStateEvent,
} from "../../shared/types.js";

export function initialState(currentVersion: string): AppUpdateState {
  return {
    phase: "idle",
    currentVersion,
    updateVersion: null,
    percent: null,
    message: null,
    errorStage: null,
  };
}

export function reduceUpdateState(
  state: AppUpdateState,
  event: UpdateStateEvent,
): AppUpdateState {
  switch (event.type) {
    case "checking":
      return {
        ...state,
        phase: "checking",
        message: null,
        errorStage: null,
      };
    case "not-available":
      return {
        ...state,
        phase: "idle",
        updateVersion: null,
        percent: null,
        message: null,
        errorStage: null,
      };
    case "available":
      return {
        ...state,
        phase: "available",
        updateVersion: event.version,
        percent: null,
        message: null,
        errorStage: null,
      };
    case "download-progress":
      return {
        ...state,
        phase: "downloading",
        percent: clampPercent(event.percent),
        message: null,
        errorStage: null,
      };
    case "downloaded":
      return {
        ...state,
        phase: "downloaded",
        updateVersion: event.version,
        percent: 100,
        message: null,
        errorStage: null,
      };
    case "installing":
      return {
        ...state,
        phase: "installing",
        message: null,
        errorStage: null,
      };
    case "error":
      return {
        ...state,
        phase: "error",
        message: event.message,
        errorStage: event.stage,
      };
  }
}

export function isInstallable(phase: AppUpdatePhase): boolean {
  return phase === "downloaded";
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
