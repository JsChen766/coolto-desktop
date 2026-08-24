import type { BrowserPageReader, PageSnapshot } from "./types.js";

export interface BrowserAgentTab {
  id: string;
  title: string;
  url: string | null;
  isActive: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserWaitRequest {
  kind: "load" | "url" | "text" | "element" | "network_idle" | "download";
  value?: string;
  timeoutMs?: number;
}

export interface BrowserWaitResult {
  condition: BrowserWaitRequest["kind"];
  elapsedMs: number;
  tab: BrowserAgentTab;
  download?: BrowserDownloadResult;
}

export interface BrowserDownloadResult {
  filename: string;
  sourceUrl: string;
  status: "completed" | "cancelled" | "interrupted";
  receivedBytes: number;
  totalBytes: number;
  completedAt: string;
}

export interface BrowserElementQuery {
  selector?: string;
  text?: string;
  role?: string;
  limit?: number;
}

export interface BrowserElementSummary {
  tagName: string;
  role: string;
  text: string;
  label: string;
  inputType: string;
  disabled: boolean;
  framePath: string[];
  shadowPath: string[];
}

export interface BrowserElementQueryResult {
  elements: BrowserElementSummary[];
  truncated: boolean;
}

export interface BrowserAccessibilityNode {
  role: string;
  name: string;
  value: string;
  description: string;
  disabled: boolean;
}

export interface BrowserScreenshot {
  data: string;
  mimeType: "image/png";
  width: number;
  height: number;
}

export interface BrowserObservation {
  tab: BrowserAgentTab;
  page: PageSnapshot;
  accessibility: BrowserAccessibilityNode[];
  accessibilityTruncated: boolean;
  screenshot?: BrowserScreenshot;
  screenshotBlockedReason?: "captcha_detected";
}

export type BrowserKeyModifier = "shift" | "control" | "alt" | "meta";

export interface BrowserKeypressRequest {
  key: string;
  modifiers?: BrowserKeyModifier[];
  fillId?: string;
}

/**
 * BE1 Agent-facing browser capability port. It exposes semantic operations,
 * never raw CDP or arbitrary JavaScript. Business sequencing stays in Agent.
 */
export interface BrowserAgentController extends BrowserPageReader {
  listTabs(): BrowserAgentTab[];
  getActiveTab(): BrowserAgentTab | null;
  newTab(url?: string): BrowserAgentTab;
  selectTab(tabId: string): BrowserAgentTab;
  closeTab(tabId: string): BrowserAgentTab | null;
  navigate(url: string): BrowserAgentTab;
  goBack(): BrowserAgentTab;
  goForward(): BrowserAgentTab;
  reload(): BrowserAgentTab;
  waitFor(request: BrowserWaitRequest, signal?: AbortSignal): Promise<BrowserWaitResult>;
  queryElements(query: BrowserElementQuery): Promise<BrowserElementQueryResult>;
  snapshot(includeScreenshot: boolean): Promise<BrowserObservation>;
  keypress(request: BrowserKeypressRequest): Promise<void>;
  hover(fillId: string): Promise<void>;
  drag(sourceFillId: string, targetFillId: string): Promise<void>;
  download(
    url: string,
    filenamePart?: string,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<BrowserDownloadResult>;
  submitElement(fillId: string): Promise<void>;
}
