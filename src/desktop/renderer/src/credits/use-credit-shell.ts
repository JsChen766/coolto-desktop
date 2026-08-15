import { ref, watch, type Ref } from "vue";

import type {
  CreditBalanceDetail,
  DesktopAgentEvent,
  DesktopApi,
  DesktopUser,
} from "@desktop/types";

/**
 * Sidebar credit chip + global insufficient-credits dialog state. The chip
 * refreshes on login and after purchases; the dialog is driven by the
 * structured agent event emitted when the LLM gateway rejects a run.
 */
export function useCreditShell(
  api: DesktopApi,
  user: Ref<DesktopUser | undefined>,
) {
  const totalCredits = ref<number>();
  const unlimited = ref(false);
  const insufficientDetail = ref<CreditBalanceDetail>();

  async function load(): Promise<void> {
    if (!user.value) {
      totalCredits.value = undefined;
      unlimited.value = false;
      return;
    }
    try {
      const summary = await api.auth.getCredits();
      totalCredits.value = summary.weeklyFreeCredits + summary.creditBalance;
      unlimited.value = summary.unlimited;
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
        totalCredits.value = undefined;
        unlimited.value = false;
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
    totalCredits,
    unlimited,
    insufficientDetail,
    load,
    handleAgentEvent,
    clearInsufficient,
  };
}
