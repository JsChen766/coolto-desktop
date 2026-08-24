export interface BrowserFillRecordView {
  fillId: string;
  label: string;
  elementType:
    | "input"
    | "textarea"
    | "select"
    | "checkbox"
    | "radio"
    | "contenteditable";
  writtenValue: string;
  decision: "pending" | "accepted" | "rejected";
}

export type BrowserPageType =
  | "jd"
  | "job_application_form"
  | "webmail_compose"
  | "unknown";

export type BrowserFillStatus = "idle" | "filling" | "reviewing" | "complete";

export interface BrowserState {
  isOpen: boolean;
  currentUrl: string | null;
  pageTitle: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  pageType: BrowserPageType;
  fillStatus: BrowserFillStatus;
}

export interface BrowserOpenInput {
  url?: string;
  theme?: "light" | "dark";
}

export interface BrowserNavigateInput {
  url: string;
}

export interface BrowserTabState {
  id: string;
  title: string;
  url: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserShellState {
  tabs: BrowserTabState[];
  activeTabId: string | null;
  theme: "light" | "dark";
  platform: DesktopPlatform;
  isMaximized: boolean;
  agentControl: BrowserAgentControlState | null;
}

export interface BrowserAgentControlState {
  taskId: string;
  goal: string;
  status: string;
  control: "agent" | "user";
  message: string;
  updatedAt: string;
}

export interface BrowserShellApi {
  platform: DesktopPlatform;
  ready(): void;
  requestState(): void;
  newTab(): void;
  closeTab(tabId: string): void;
  selectTab(tabId: string): void;
  navigate(url: string): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  reportChromeHeight(height: number): void;
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  pauseAgent(): void;
  resumeAgent(): void;
  takeoverAgent(): void;
  stopAgent(): void;
  onStateChanged(listener: (state: BrowserShellState) => void): () => void;
}

export type DesktopPlatform =
  | "aix"
  | "darwin"
  | "freebsd"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "android"
  | "haiku"
  | "cygwin"
  | "netbsd";
