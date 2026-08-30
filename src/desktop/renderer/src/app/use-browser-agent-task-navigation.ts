import { onBeforeUnmount, onMounted, shallowReadonly, shallowRef } from "vue";

import { desktopApi } from "../lib/desktop-api";
import {
  nextBrowserAgentTaskNavigation,
  nextBrowserPageHandoffNavigation,
  type BrowserAgentTaskNavigationRequest,
  type BrowserPageHandoffNavigationRequest,
} from "../../../../browser/browser-agent-task-navigation.js";
import { publishBrowserPageHandoff } from
  "../browser/browser-page-handoff-channel";

export function useBrowserAgentTaskNavigation() {
  const request = shallowRef<BrowserAgentTaskNavigationRequest>();
  const page = shallowRef<BrowserPageHandoffNavigationRequest>();
  const unsubscribes: Array<() => void> = [];

  onMounted(() => {
    unsubscribes.push(desktopApi.browser.onOpenAgentTask((nextTaskId) => {
      const next = nextBrowserAgentTaskNavigation(request.value, nextTaskId);
      if (!next) return;
      request.value = next;
    }));
    unsubscribes.push(desktopApi.browser.onOpenPageInApp((nextPage) => {
      const next = nextBrowserPageHandoffNavigation(page.value, nextPage);
      if (!next) return;
      page.value = next;
      publishBrowserPageHandoff(next);
    }));
  });
  onBeforeUnmount(() => { for (const unsubscribe of unsubscribes) unsubscribe(); });

  return { page: shallowReadonly(page), task: shallowReadonly(request) };
}
