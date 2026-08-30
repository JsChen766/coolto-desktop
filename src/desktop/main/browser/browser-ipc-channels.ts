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
