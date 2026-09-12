import { CooltoApiError } from "../../../api/coolto-api-error.js";
import { BUNDLED_PRIVACY_POLICY } from "../../../privacy/policy.js";
import type {
  PrivacyConsentView,
  PrivacyPolicyView,
} from "../../../privacy/types.js";
import type { CachedPrivacyConsent } from "./privacy-local-state.js";

export function acceptedEntry(policy: PrivacyPolicyView, now: Date): CachedPrivacyConsent {
  const timestamp = now.toISOString();
  return {
    policyVersion: policy.policyVersion,
    contentHash: policy.contentHash,
    status: "accepted",
    acceptedAt: timestamp,
    decisionAt: timestamp,
  };
}

export function consentView(
  policy: PrivacyPolicyView,
  status: PrivacyConsentView["status"],
  now: Date,
): PrivacyConsentView {
  const timestamp = now.toISOString();
  return {
    policyVersion: policy.policyVersion,
    status,
    acceptedAt: status === "accepted" ? timestamp : null,
    decisionAt: timestamp,
  };
}

export function isAccepted(
  value: PrivacyConsentView | null | undefined,
  policy: PrivacyPolicyView,
): boolean {
  return value?.status === "accepted" && value.policyVersion === policy.policyVersion;
}

export function isCurrentAccepted(
  value: CachedPrivacyConsent | undefined,
  policy: PrivacyPolicyView,
): boolean {
  return value?.status === "accepted" && value.policyVersion === policy.policyVersion && value.contentHash === policy.contentHash;
}

export function isSupportedPolicy(policy: PrivacyPolicyView): boolean {
  return policy.policyVersion === BUNDLED_PRIVACY_POLICY.policyVersion &&
    policy.contentHash === BUNDLED_PRIVACY_POLICY.contentHash;
}

export function isOfflineRecoverable(error: unknown): boolean {
  if (error instanceof CooltoApiError) return false;
  return error instanceof TypeError ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError"));
}

export function privacyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("当前隐私政策版本需要更新") ||
    (error instanceof CooltoApiError &&
      (error.status === 404 || error.code === "privacy_endpoint_unavailable"))
  ) return "当前服务器尚不支持隐私功能，请升级 Coolto";
  if (!isOfflineRecoverable(error)) return "隐私功能当前不可用，请稍后重试";
  return "无法连接隐私服务；仅允许已验证账号的本地模式";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
