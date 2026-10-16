import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { shallowRef } from "vue";

import type {
  DesktopApi,
  DesktopCreditSummary,
  DesktopUser,
} from "../src/desktop/shared/types.js";
import { useCreditShell } from
  "../src/desktop/renderer/src/credits/use-credit-shell.js";

test("all credit surfaces derive from one replaceable summary", async () => {
  let response = summary(true, 0, 0);
  const user = shallowRef<DesktopUser | undefined>({
    id: "user-1",
    email: "qa@example.com",
  });
  const api = {
    auth: { getCredits: async () => structuredClone(response) },
  } as unknown as DesktopApi;
  const state = useCreditShell(api, user);

  await state.refreshSummary();
  assert.equal(state.summary.value?.unlimited, true);
  assert.equal(state.unlimited.value, true);
  assert.equal(state.totalCredits.value, 0);

  response = summary(false, 5, 15);
  await state.refreshSummary();
  assert.equal(state.summary.value?.unlimited, false);
  assert.equal(state.unlimited.value, false);
  assert.equal(state.totalCredits.value, 20);
});

test("unlimited presentation hides numeric zero and purchase plans", async () => {
  const [host, dialog, balance, account, state] = await Promise.all([
    source("../src/desktop/renderer/src/components/CreditsHost.vue"),
    source("../src/desktop/renderer/src/components/CreditDialog.vue"),
    source("../src/desktop/renderer/src/components/CreditBalanceSummary.vue"),
    source("../src/desktop/renderer/src/components/UserAccountMenu.vue"),
    source("../src/desktop/renderer/src/credits/use-credit-dialog.ts"),
  ]);

  assert.match(host, /:summary="summary"[\s\S]+:refresh-summary="refreshSummary"/u);
  assert.match(dialog, /v-if="!summary\.unlimited"/u);
  assert.match(balance, /v-if="summary\.unlimited"[\s\S]+无限量/u);
  assert.doesNotMatch(account, /Credit 与套餐/u);
  assert.doesNotMatch(state, /api\.auth\.getCredits/u);
});

function summary(
  unlimited: boolean,
  weeklyFreeCredits: number,
  creditBalance: number,
): DesktopCreditSummary {
  return {
    weeklyFreeCredits,
    creditBalance,
    planType: "NONE",
    hasFreeTrial: false,
    unlimited,
    recentTransactions: [],
  };
}

function source(relative: string): Promise<string> {
  return readFile(new URL(relative, import.meta.url), "utf8");
}
