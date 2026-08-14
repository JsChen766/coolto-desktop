import { computed, ref } from "vue";

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

/**
 * Credit balance + plan catalog + purchase flow state (PRD D1/D2). The
 * purchase flow follows PRD D2: open the Afdian link in the system browser,
 * poll the credit summary, then fall back to manual verification.
 */
export function useCreditDialog(api: DesktopApi) {
  const summary = ref<DesktopCreditSummary>();
  const plans = ref<CheckoutPlan[]>([]);
  const phase = ref<PurchasePhase>("idle");
  const busy = ref(false);
  const loadError = ref<string>();
  const purchaseError = ref<string>();
  const lastCheckoutId = ref(
    localStorage.getItem(LAST_CHECKOUT_KEY) ?? undefined,
  );
  let disposed = false;

  const totalCredits = computed(
    () =>
      (summary.value?.weeklyFreeCredits ?? 0) +
      (summary.value?.creditBalance ?? 0),
  );

  async function loadAll(): Promise<void> {
    busy.value = true;
    loadError.value = undefined;
    try {
      const [freshSummary, freshPlans] = await Promise.all([
        api.auth.getCredits(),
        api.checkout.plans(),
      ]);
      summary.value = freshSummary;
      plans.value = freshPlans;
    } catch (error: unknown) {
      loadError.value =
        error instanceof Error ? error.message : String(error);
    } finally {
      busy.value = false;
    }
  }

  async function refreshSummary(): Promise<void> {
    try {
      summary.value = await api.auth.getCredits();
    } catch {
      // Poll failures must not kill the waiting state; the user can retry.
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
      await refreshSummary();
      if (totalCredits.value > initialTotal) {
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

  function dispose(): void {
    disposed = true;
  }

  return {
    summary,
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
    dispose,
  };
}
