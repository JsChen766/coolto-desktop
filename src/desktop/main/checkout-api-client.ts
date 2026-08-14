import { CooltoApiError } from "../../api/coolto-api-error.js";
import type {
  CheckoutPlan,
  CheckoutResult,
  CheckoutVerifyResult,
} from "../shared/types.js";

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

interface CheckoutPlanPayload {
  plan_type?: unknown;
  price_cny?: unknown;
  credits?: unknown;
  valid_days?: unknown;
}

interface CheckoutPayload {
  checkout_id?: unknown;
  afdian_url?: unknown;
}

async function request<T>(
  baseUrl: string,
  sessionToken: string,
  path: string,
  init: RequestInit,
  label: string,
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchFn(`${baseUrl.replace(/\/+$/u, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Cookie: `access_token=${sessionToken}`,
      ...init.headers,
    },
  });
  let payload: Envelope<T> | undefined;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    // Non-JSON responses (e.g. an un-deployed gateway route returning 404)
    // must surface as a readable error instead of a JSON.parse SyntaxError.
    throw new CooltoApiError(
      `${label} 请求失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  if (!response.ok || payload.success !== true || !payload.data) {
    throw new CooltoApiError(
      payload.error?.message ?? `${label} 请求失败（HTTP ${response.status}）`,
      response.status,
      payload.error?.code,
    );
  }
  return payload.data;
}

export async function fetchPlans(
  baseUrl: string,
  sessionToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<CheckoutPlan[]> {
  const payload = await request<unknown>(
    baseUrl, sessionToken, "/api/plans", { method: "GET" }, "套餐列表", fetchFn,
  );
  if (!Array.isArray(payload)) {
    throw new CooltoApiError("套餐列表返回格式错误", 502, "invalid_contract");
  }
  return payload.map(normalizePlan);
}

function normalizePlan(value: unknown): CheckoutPlan {
  if (!value || typeof value !== "object") {
    throw new CooltoApiError("套餐列表返回格式错误", 502, "invalid_contract");
  }
  const plan = value as CheckoutPlanPayload;
  if (
    (plan.plan_type !== "WEEKLY" && plan.plan_type !== "MONTHLY") ||
    !isNonNegativeInteger(plan.price_cny) ||
    !isPositiveInteger(plan.credits) ||
    !isPositiveInteger(plan.valid_days)
  ) {
    throw new CooltoApiError("套餐列表返回格式错误", 502, "invalid_contract");
  }
  return {
    planType: plan.plan_type,
    priceCny: plan.price_cny,
    credits: plan.credits,
    validDays: plan.valid_days,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export async function createCheckout(
  baseUrl: string,
  sessionToken: string,
  planType: string,
  fetchFn: typeof fetch = fetch,
): Promise<CheckoutResult> {
  const payload = await request<unknown>(
    baseUrl, sessionToken, "/api/checkout",
    { method: "POST", body: JSON.stringify({ plan_type: planType }) },
    "创建购买记录", fetchFn,
  );
  return normalizeCheckout(payload);
}

function normalizeCheckout(value: unknown): CheckoutResult {
  if (!value || typeof value !== "object") {
    throw new CooltoApiError("创建购买记录返回格式错误", 502, "invalid_contract");
  }
  const checkout = value as CheckoutPayload;
  if (
    typeof checkout.checkout_id !== "string" ||
    !checkout.checkout_id ||
    !isHttpUrl(checkout.afdian_url)
  ) {
    throw new CooltoApiError("创建购买记录返回格式错误", 502, "invalid_contract");
  }
  return {
    checkoutId: checkout.checkout_id,
    afdianUrl: checkout.afdian_url,
  };
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function verifyCheckout(
  baseUrl: string,
  sessionToken: string,
  checkoutId: string,
  fetchFn: typeof fetch = fetch,
): Promise<CheckoutVerifyResult> {
  return request<CheckoutVerifyResult>(
    baseUrl, sessionToken, "/api/checkout/verify",
    { method: "POST", body: JSON.stringify({ checkout_id: checkoutId }) },
    "查询支付结果", fetchFn,
  );
}
