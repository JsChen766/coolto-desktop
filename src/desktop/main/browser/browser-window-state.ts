import type {
  BrowserShellState,
  BrowserState,
  BrowserPageHandoffView,
} from "../../shared/types.js";
import type {
  BrowserFieldWriteRecord,
  CaptchaDetection,
  FieldReviewDecision,
  ReviewOutcome,
} from "../../../browser/types.js";

export const IDLE_BROWSER_STATE: BrowserState = {
  isOpen: false,
  currentUrl: null,
  pageTitle: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  pageType: "unknown",
  fillStatus: "idle",
};

export interface BrowserWindowEmitters {
  emitState: (state: BrowserState) => void;
  emitShellState: (state: BrowserShellState) => void;
  emitFillProgress: (records: BrowserFieldWriteRecord[], reviewing: boolean) => void;
  emitReviewDecision: (fillId: string, decision: FieldReviewDecision) => void;
  emitReviewComplete: (outcome: ReviewOutcome) => void;
  emitCaptchaDetected: (detection: CaptchaDetection) => void;
  openAgentTask: (taskId: string) => void;
  openPageInApp: (page: BrowserPageHandoffView) => void;
}
