import assert from "node:assert/strict";
import test from "node:test";

import {
  createCheckout,
  fetchPlans,
} from "../src/desktop/main/checkout-api-client.js";

test("checkout plans map the Credit API snake_case contract", async () => {
  const plans = await fetchPlans(
    "https://credit.coolto.com.cn/",
    "session-token",
    (async () => new Response(JSON.stringify({
      success: true,
      data: [{
        plan_type: "WEEKLY",
        price_cny: 990,
        credits: 100,
        valid_days: 7,
      }],
    }), { status: 200 })) as typeof fetch,
  );

  assert.deepEqual(plans, [{
    planType: "WEEKLY",
    priceCny: 990,
    credits: 100,
    validDays: 7,
  }]);
});

test("checkout plans reject malformed Credit API data", async () => {
  await assert.rejects(
    fetchPlans(
      "https://credit.coolto.com.cn",
      "session-token",
      (async () => new Response(JSON.stringify({
        success: true,
        data: [{
          plan_type: "MONTHLY",
          price_cny: "2990",
          credits: 400,
          valid_days: 30,
        }],
      }), { status: 200 })) as typeof fetch,
    ),
    /套餐列表返回格式错误/u,
  );
});

test("checkout creation maps the Credit API snake_case contract", async () => {
  const checkout = await createCheckout(
    "https://credit.coolto.com.cn",
    "session-token",
    "MONTHLY",
    (async () => new Response(JSON.stringify({
      success: true,
      data: {
        checkout_id: "checkout-123",
        afdian_url: "https://ifdian.net/order/create?custom_order_id=checkout-123",
      },
    }), { status: 200 })) as typeof fetch,
  );

  assert.deepEqual(checkout, {
    checkoutId: "checkout-123",
    afdianUrl: "https://ifdian.net/order/create?custom_order_id=checkout-123",
  });
});

test("checkout creation rejects a non-http payment URL", async () => {
  await assert.rejects(
    createCheckout(
      "https://credit.coolto.com.cn",
      "session-token",
      "MONTHLY",
      (async () => new Response(JSON.stringify({
        success: true,
        data: { checkout_id: "checkout-123", afdian_url: "not-a-url" },
      }), { status: 200 })) as typeof fetch,
    ),
    /创建购买记录返回格式错误/u,
  );
});
