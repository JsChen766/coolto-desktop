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
  return request<CheckoutPlan[]>(
    baseUrl, sessionToken, "/api/plans", { method: "GET" }, "套餐列表", fetchFn,
  );
}

export async function createCheckout(
  baseUrl: string,
  sessionToken: string,
  planType: string,
  fetchFn: typeof fetch = fetch,
): Promise<CheckoutResult> {
  return request<CheckoutResult>(
    baseUrl, sessionToken, "/api/checkout",
    { method: "POST", body: JSON.stringify({ plan_type: planType }) },
    "创建购买记录", fetchFn,
  );
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
