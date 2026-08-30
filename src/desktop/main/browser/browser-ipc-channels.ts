export const BROWSER_IPC_CHANNELS = {
  open: "browser:open",
  close: "browser:close",
  navigate: "browser:navigate",
  goBack: "browser:go-back",
  goForward: "browser:go-forward",
  reload: "browser:reload",
  getState: "browser:get-state",
  stateChanged: "browser:state-changed",
  fillProgress: "browser:fill-progress",
  reviewDecision: "browser:review-decision",
  reviewComplete: "browser:review-complete",
  captchaDetected: "browser:captcha-detected",
  openAgentTask: "browser:open-agent-task",
  openPageInApp: "browser:open-page-in-app",
  abortFill: "browser:abort-fill",
} as const;

/** 浏览器窗口内 chrome（标签栏 UI）与主进程之间的通道。 */
export const BROWSER_SHELL_CHANNELS = {
  ready: "browser-shell:ready",
  stateChanged: "browser-shell:state-changed",
  requestState: "browser-shell:request-state",
  newTab: "browser-shell:new-tab",
  closeTab: "browser-shell:close-tab",
  selectTab: "browser-shell:select-tab",
  navigate: "browser-shell:navigate",
  goBack: "browser-shell:go-back",
  goForward: "browser-shell:go-forward",
  reload: "browser-shell:reload",
  stopLoading: "browser-shell:stop-loading",
  chromeHeight: "browser-shell:chrome-height",
  minimize: "browser-shell:minimize",
  toggleMaximize: "browser-shell:toggle-maximize",
  closeWindow: "browser-shell:close-window",
  pauseAgent: "browser-shell:agent-pause",
  resumeAgent: "browser-shell:agent-resume",
  takeoverAgent: "browser-shell:agent-takeover",
  stopAgent: "browser-shell:agent-stop",
  dismissPermissionNotice: "browser-shell:dismiss-permission-notice",
  dismissDownload: "browser-shell:dismiss-download",
  toggleDownloadPopover: "browser-shell:toggle-download-popover",
  openPageInApp: "browser-shell:open-page-in-app",
  toggleAgentInspector: "browser-shell:toggle-agent-inspector",
  searchFind: "browser-shell:search-find",
  findNext: "browser-shell:find-next",
  closeFind: "browser-shell:close-find",
  resetZoom: "browser-shell:reset-zoom",
  focusAddress: "browser-shell:focus-address",
  focusFind: "browser-shell:focus-find",
  focusAgentCapsule: "browser-shell:focus-agent-capsule",
  focusDownloads: "browser-shell:focus-downloads",
} as const;

export const BROWSER_AGENT_INSPECTOR_CHANNELS = {
  ready: "browser-agent-inspector:ready",
  stateChanged: "browser-agent-inspector:state-changed",
  focus: "browser-agent-inspector:focus",
  close: "browser-agent-inspector:close",
  command: "browser-agent-inspector:command",
  openTask: "browser-agent-inspector:open-task",
} as const;

export const BROWSER_DOWNLOAD_POPOVER_CHANNELS = {
  ready: "browser-download-popover:ready",
  stateChanged: "browser-download-popover:state-changed",
  focus: "browser-download-popover:focus",
  close: "browser-download-popover:close",
  dismiss: "browser-download-popover:dismiss",
} as const;

export type BrowserIpcChannel =
  (typeof BROWSER_IPC_CHANNELS)[keyof typeof BROWSER_IPC_CHANNELS];

export const BROWSER_INVOKE_CHANNELS: BrowserIpcChannel[] = [
  BROWSER_IPC_CHANNELS.open,
  BROWSER_IPC_CHANNELS.close,
  BROWSER_IPC_CHANNELS.navigate,
  BROWSER_IPC_CHANNELS.goBack,
  BROWSER_IPC_CHANNELS.goForward,
  BROWSER_IPC_CHANNELS.reload,
  BROWSER_IPC_CHANNELS.getState,
  BROWSER_IPC_CHANNELS.abortFill,
];
