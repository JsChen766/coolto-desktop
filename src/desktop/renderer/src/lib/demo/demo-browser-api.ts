import type { BrowserState, DesktopApi } from "@desktop/types";

function idleBrowserState(): BrowserState {
  return {
    isOpen: false,
    currentUrl: null,
    pageTitle: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    pageType: "unknown",
    fillStatus: "idle",
  };
}

export function createDemoBrowserApi(): DesktopApi["browser"] {
  const listeners = new Set<(state: BrowserState) => void>();
  let state = idleBrowserState();
  const emit = (): void => {
    for (const listener of listeners) listener(structuredClone(state));
  };
  return {
    open: async (input) => {
      state = {
        ...idleBrowserState(),
        isOpen: true,
        currentUrl: input?.url ?? null,
        pageTitle: input?.url ? null : "Coolto 主页",
      };
      emit();
      return structuredClone(state);
    },
    close: async () => {
      state = idleBrowserState();
      emit();
    },
    navigate: async ({ url }) => {
      state = { ...state, currentUrl: url, isLoading: true };
      emit();
    },
    goBack: async () => undefined,
    goForward: async () => undefined,
    reload: async () => undefined,
    getState: async () => structuredClone(state),
    abortFill: async () => undefined,
    onStateChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onFillProgress: () => () => undefined,
    onReviewDecision: () => () => undefined,
    onReviewComplete: () => () => undefined,
  onCaptchaDetected: () => () => undefined,
  onOpenAgentTask: () => () => undefined,
  onOpenPageInApp: () => () => undefined,
};
}
