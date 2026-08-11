import assert from "node:assert/strict";
import test from "node:test";

import { fetchCreditSummary } from "../src/desktop/main/credit-api-client.js";

test("credit client reuses the authenticated APP session", async () => {
  let request: { url: string; cookie: string | null } | undefined;
  const result = await fetchCreditSummary(
    "https://credit.coolto.com.cn/",
    "session-token",
    (async (input, init) => {
      request = {
        url: String(input),
        cookie: new Headers(init?.headers).get("cookie"),
      };
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            weekly_free_credits: 5,
            credit_balance: 15,
            plan_type: "NONE",
            has_free_trial: true,
            recent_transactions: [
              {
                amount: -5,
                transaction_type: "USAGE",
                created_at: "2026-08-11T10:00:00Z",
              },
            ],
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch,
  );

  assert.deepEqual(request, {
    url: "https://credit.coolto.com.cn/api/user/credits",
    cookie: "access_token=session-token",
  });
  assert.equal(result.recentTransactions[0]?.amount, -5);
});
