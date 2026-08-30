import { onBeforeUnmount, onMounted, reactive, readonly } from "vue";

import type {
  BrowserOpenInput,
  BrowserState,
} from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";
import { openPresentedBrowser } from "./open-presented-browser";

const IDLE_STATE: BrowserState = {
  isOpen: false,
  currentUrl: null,
  pageTitle: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  pageType: "unknown",
  fillStatus: "idle",
};

/**
 * B1: 订阅 browser:state-changed，暴露响应式 BrowserState 及导航控制方法。
 * 地址栏只读：不提供直接输入 URL 的方法，导航靠浏览器窗口内主页搜索/页内链接。
 */
export function useBrowserState() {
  const state = reactive<BrowserState>({ ...IDLE_STATE });

  const apply = (next: BrowserState): void => {
    Object.assign(state, next);
  };

  const unsubscribe = desktopApi.browser.onStateChanged(apply);
  onMounted(() => void desktopApi.browser.getState().then(apply));
  onBeforeUnmount(unsubscribe);

  async function open(input?: BrowserOpenInput): Promise<void> {
    apply(await openPresentedBrowser(desktopApi, input));
  }

  async function close(): Promise<void> {
    await desktopApi.browser.close();
  }

  return {
    state: readonly(state),
    open,
    close,
    goBack: () => desktopApi.browser.goBack(),
    goForward: () => desktopApi.browser.goForward(),
    reload: () => desktopApi.browser.reload(),
  };
}

export type UseBrowserState = ReturnType<typeof useBrowserState>;
