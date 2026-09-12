import type { CurrentUser } from "../../api/types.js";
import { readConfig } from "../../config.js";
import { fetchCreditSummary } from "./credit-api-client.js";
import { createCheckout, fetchPlans, verifyCheckout } from "./checkout-api-client.js";

export interface AuthBillingSession {
  requireCurrentUser(): CurrentUser;
  apiClient: { getSessionToken(): string };
  privacy: { isCloudBusinessAllowed: boolean };
}

export function getCredits(auth: AuthBillingSession) {
  const context = billingContext(auth);
  return fetchCreditSummary(context.baseUrl, context.token);
}

export function getCheckoutPlans(auth: AuthBillingSession) {
  const context = billingContext(auth);
  return fetchPlans(context.baseUrl, context.token);
}

export function createPlanCheckout(auth: AuthBillingSession, planType: string) {
  const context = billingContext(auth);
  return createCheckout(context.baseUrl, context.token, planType);
}

export function verifyPlanCheckout(auth: AuthBillingSession, checkoutId: string) {
  const context = billingContext(auth);
  return verifyCheckout(context.baseUrl, context.token, checkoutId);
}

function billingContext(auth: AuthBillingSession): { baseUrl: string; token: string } {
  auth.requireCurrentUser();
  if (!auth.privacy.isCloudBusinessAllowed) throw new Error("请先完成当前版本的隐私同意");
  const baseUrl = readConfig().llmGatewayBaseUrl;
  if (!baseUrl) throw new Error("尚未配置 Coolto Credit API");
  return { baseUrl, token: auth.apiClient.getSessionToken() };
}
