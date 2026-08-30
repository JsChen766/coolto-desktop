import type { BrowserAgentChromeView } from "./browser-agent.js";

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
export type BrowserLocale = "zh-CN" | "en-US";
export type BrowserLoadPhase =
  | "idle"
  | "starting"
  | "committed"
  | "dom-ready"
  | "complete"
  | "failed";

export interface BrowserNavigationFailure {
  code: number;
  description: string;
  url: string;
}

export interface BrowserFindState {
  activeMatchOrdinal: number;
  matches: number;
  open: boolean;
  query: string;
}

export interface BrowserPermissionNotice {
  createdAt: string;
  origin: string | null;
  permission: string;
}

export type BrowserDownloadStatus =
  | "progressing"
  | "completed"
  | "cancelled"
  | "interrupted";

export interface BrowserDownloadView {
  id: string;
  filename: string;
  sourceOrigin: string | null;
  status: BrowserDownloadStatus;
  receivedBytes: number;
  totalBytes: number;
  startedAt: string;
  updatedAt: string;
}

export interface BrowserDownloadPopoverViewState {
  downloads: BrowserDownloadView[];
  locale: BrowserLocale;
  theme: "light" | "dark";
}

export interface BrowserDownloadPopoverApi {
  ready(): void;
  close(): void;
  dismiss(downloadId: string): void;
  onStateChanged(
    listener: (state: BrowserDownloadPopoverViewState) => void,
  ): () => void;
  onFocus(listener: () => void): () => void;
}

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
  locale?: BrowserLocale;
}

export interface BrowserNavigateInput {
  url: string;
}

export interface BrowserPageHandoffView {
  title: string;
  url: string;
}

export interface BrowserTabState {
  id: string;
  title: string;
  url: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  faviconUrl: string | null;
  failure: BrowserNavigationFailure | null;
  loadPhase: BrowserLoadPhase;
  find: BrowserFindState;
  zoomFactor: number;
}

export interface BrowserShellState {
  tabs: BrowserTabState[];
  activeTabId: string | null;
  theme: "light" | "dark";
  locale: BrowserLocale;
  platform: DesktopPlatform;
  isMaximized: boolean;
  agentInspectorOpen: boolean;
  agentControl: BrowserAgentChromeView | null;
  downloadPopoverOpen: boolean;
  downloads: BrowserDownloadView[];
  permissionNotice: BrowserPermissionNotice | null;
}

export interface BrowserShellApi {
  platform: DesktopPlatform;
  ready(locale?: BrowserLocale): void;
  requestState(): void;
  newTab(): void;
  closeTab(tabId: string): void;
  selectTab(tabId: string): void;
  navigate(url: string): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  stopLoading(): void;
  reportChromeHeight(height: number): void;
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  pauseAgent(): void;
  resumeAgent(): void;
  takeoverAgent(): void;
  stopAgent(): void;
  dismissDownload(downloadId: string): void;
  toggleDownloadPopover(): void;
  openPageInApp(): void;
  dismissPermissionNotice(): void;
  toggleAgentInspector(): void;
  searchFind(query: string): void;
  findNext(direction: "next" | "previous"): void;
  closeFind(): void;
  resetZoom(): void;
  onStateChanged(listener: (state: BrowserShellState) => void): () => void;
  onFocusAddress(listener: () => void): () => void;
  onFocusFind(listener: () => void): () => void;
  onFocusAgentCapsule(listener: () => void): () => void;
  onFocusDownloads(listener: () => void): () => void;
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
