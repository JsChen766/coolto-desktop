import type {
  BrowserFillRecordView,
  BrowserNavigateInput,
  BrowserOpenInput,
  BrowserPageHandoffView,
  BrowserState,
} from "./browser.js";

export interface BrowserDesktopApi {
  open(input?: BrowserOpenInput): Promise<BrowserState>;
  close(): Promise<void>;
  navigate(input: BrowserNavigateInput): Promise<void>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  getState(): Promise<BrowserState>;
  abortFill(): Promise<void>;
  onStateChanged(listener: (state: BrowserState) => void): () => void;
  onFillProgress(listener: (payload: {
    records: BrowserFillRecordView[];
    reviewing: boolean;
  }) => void): () => void;
  onReviewDecision(listener: (payload: {
    fillId: string;
    decision: "accepted" | "rejected";
  }) => void): () => void;
  onReviewComplete(listener: (payload: {
    action: "accepted" | "rejected" | "mixed";
    acceptedCount: number;
    rejectedCount: number;
  }) => void): () => void;
  onCaptchaDetected(listener: (payload: {
    kind: "recaptcha" | "hcaptcha" | "geetest" | "slider" | "image" | "unknown";
    detail?: string;
  }) => void): () => void;
  onOpenAgentTask(listener: (taskId: string) => void): () => void;
  onOpenPageInApp(listener: (page: BrowserPageHandoffView) => void): () => void;
}
