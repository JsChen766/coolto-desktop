import { computed, shallowRef, type Ref } from "vue";

import type {
  CheckoutPlan,
  DesktopApi,
  DesktopCreditSummary,
} from "@desktop/types";

export type PurchasePhase =
  | "idle"
  | "opening"
  | "waiting"
  | "success"
  | "timeout"
  | "error";

const LAST_CHECKOUT_KEY = "coolto:last-checkout";
const POLL_INTERVAL_MS = 3_000;
const POLL_ATTEMPTS = 10;

interface UseCreditDialogOptions {
  summary: Readonly<Ref<DesktopCreditSummary | undefined>>;
  refreshSummary: () => Promise<DesktopCreditSummary | undefined>;
}

/**
 * Credit balance + plan catalog + purchase flow state (PRD D1/D2). The
 * purchase flow follows PRD D2: open the Afdian link in the system browser,
 * poll the credit summary, then fall back to manual verification.
 */
export function useCreditDialog(
  api: DesktopApi,
  options: UseCreditDialogOptions,
) {
  const plans = shallowRef<CheckoutPlan[]>([]);
  const phase = shallowRef<PurchasePhase>("idle");
  const busy = shallowRef(false);
  const loadError = shallowRef<string>();
  const purchaseError = shallowRef<string>();
  const lastCheckoutId = shallowRef(
    localStorage.getItem(LAST_CHECKOUT_KEY) ?? undefined,
  );
  let disposed = false;

  const totalCredits = computed(
    () =>
      (options.summary.value?.weeklyFreeCredits ?? 0) +
      (options.summary.value?.creditBalance ?? 0),
  );

  async function loadAll(): Promise<void> {
    busy.value = true;
    loadError.value = undefined;
    try {
      const freshSummary = await options.refreshSummary();
      plans.value = freshSummary?.unlimited
        ? []
        : await api.checkout.plans();
    } catch (error: unknown) {
      loadError.value =
        error instanceof Error ? error.message : String(error);
    } finally {
      busy.value = false;
    }
  }

  async function refreshSummary(): Promise<DesktopCreditSummary | undefined> {
    try {
      return await options.refreshSummary();
    } catch {
      // Poll failures must not kill the waiting state; the user can retry.
      return undefined;
    }
  }

  async function startPurchase(planType: string): Promise<void> {
    phase.value = "opening";
    purchaseError.value = undefined;
    try {
      const result = await api.checkout.create(planType);
      lastCheckoutId.value = result.checkoutId;
      localStorage.setItem(LAST_CHECKOUT_KEY, result.checkoutId);
      await api.shell.openExternal(result.afdianUrl);
      phase.value = "waiting";
      await pollForCredits();
    } catch (error: unknown) {
      phase.value = "error";
      purchaseError.value =
        error instanceof Error ? error.message : String(error);
    }
  }

  async function pollForCredits(): Promise<void> {
    const initialTotal = totalCredits.value;
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (disposed) return;
      const freshSummary = await refreshSummary();
      const freshTotal = freshSummary
        ? freshSummary.weeklyFreeCredits + freshSummary.creditBalance
        : totalCredits.value;
      if (freshTotal > initialTotal) {
        phase.value = "success";
        return;
      }
    }
    if (!disposed) phase.value = "timeout";
  }

  async function verifyPayment(): Promise<void> {
    if (!lastCheckoutId.value) return;
    busy.value = true;
    purchaseError.value = undefined;
    try {
      const result = await api.checkout.verify(lastCheckoutId.value);
      if (result.status === "completed") {
        await refreshSummary();
        phase.value = "success";
      } else {
        phase.value = "timeout";
        purchaseError.value =
          result.status === "not_found"
            ? "暂未查到支付记录，请确认是否已完成付款"
            : "支付还在处理中，请稍后再试";
      }
    } catch (error: unknown) {
      purchaseError.value =
        error instanceof Error ? error.message : String(error);
    } finally {
      busy.value = false;
    }
  }

  function resetPurchase(): void {
    phase.value = "idle";
    purchaseError.value = undefined;
  }

  function dispose(): void {
    disposed = true;
  }

  return {
    summary: options.summary,
    plans,
    phase,
    busy,
    loadError,
    purchaseError,
    totalCredits,
    loadAll,
    refreshSummary,
    startPurchase,
    verifyPayment,
    resetPurchase,
    dispose,
  };
}
