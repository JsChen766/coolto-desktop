import { computed, shallowRef, watch, type Ref } from "vue";

import type {
  CreditBalanceDetail,
  DesktopAgentEvent,
  DesktopApi,
  DesktopCreditSummary,
  DesktopUser,
} from "../../../shared/types.js";

/**
 * Sidebar credit chip + global insufficient-credits dialog state. The chip
 * refreshes on login and after purchases; the dialog is driven by the
 * structured agent event emitted when the LLM gateway rejects a run.
 */
export function useCreditShell(
  api: DesktopApi,
  user: Ref<DesktopUser | undefined>,
) {
  const summary = shallowRef<DesktopCreditSummary>();
  const totalCredits = computed(() => summary.value
    ? summary.value.weeklyFreeCredits + summary.value.creditBalance
    : undefined);
  const unlimited = computed(() => summary.value?.unlimited === true);
  const insufficientDetail = shallowRef<CreditBalanceDetail>();

  async function refreshSummary(): Promise<DesktopCreditSummary | undefined> {
    if (!user.value) {
      summary.value = undefined;
      return undefined;
    }
    summary.value = await api.auth.getCredits();
    return summary.value;
  }

  async function load(): Promise<void> {
    if (!user.value) {
      summary.value = undefined;
      return;
    }
    try {
      await refreshSummary();
    } catch {
      // The chip is a convenience surface; a failure must not disturb the UI.
    }
  }

  watch(
    user,
    (next) => {
      if (next) {
        void load();
      } else {
        summary.value = undefined;
        insufficientDetail.value = undefined;
      }
    },
    { immediate: true },
  );

  function handleAgentEvent(
    _conversationId: string,
    event: DesktopAgentEvent,
  ): void {
    if (event.type === "agent.insufficient-credits") {
      insufficientDetail.value = event.detail;
      void load();
      return;
    }
    // Every completed run consumed credits on the gateway; refresh the chip
    // so the sidebar balance stays in sync with the server.
    if (event.type === "run.completed" || event.type === "run.failed") {
      void load();
    }
  }

  function clearInsufficient(): void {
    insufficientDetail.value = undefined;
  }

  return {
    summary,
    totalCredits,
    unlimited,
    insufficientDetail,
    load,
    refreshSummary,
    handleAgentEvent,
    clearInsufficient,
  };
}
