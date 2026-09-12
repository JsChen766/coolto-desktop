import { randomUUID } from "node:crypto";

import { PrivacyApi } from "../../../api/privacy-api.js";
import { BUNDLED_PRIVACY_POLICY } from "../../../privacy/policy.js";
import type {
  PrivacyConsentDecision,
  PrivacyConsentView,
  PrivacyPolicyView,
} from "../../../privacy/types.js";
import {
  isAccepted,
  isCurrentAccepted,
  isOfflineRecoverable,
  isSupportedPolicy,
  privacyError,
} from "./privacy-state-helpers.js";
import type { CachedPrivacyConsent } from "./privacy-local-state.js";

export interface PrivacyLocalStatePort {
  get(accountId?: string): Promise<CachedPrivacyConsent | undefined>;
  set(accountId: string | undefined, value: CachedPrivacyConsent): Promise<void>;
  clear(accountId?: string): Promise<void>;
  clearAccountAndAnonymous?(accountId: string): Promise<void>;
}

export interface PrivacyPolicyRefresh {
  policy: PrivacyPolicyView;
  available: boolean;
  offlineCacheAllowed: boolean;
  error: string | null;
}

export async function refreshPrivacyPolicy(api: PrivacyApi): Promise<PrivacyPolicyRefresh> {
  try {
    const policy = await api.getPolicy();
    if (!isSupportedPolicy(policy)) throw new Error("当前隐私政策版本需要更新 Coolto");
    return { policy, available: true, offlineCacheAllowed: false, error: null };
  } catch (error: unknown) {
    return {
      policy: BUNDLED_PRIVACY_POLICY,
      available: false,
      offlineCacheAllowed: isOfflineRecoverable(error),
      error: privacyError(error),
    };
  }
}

export async function loadCachedAcceptance(
  local: PrivacyLocalStatePort,
  accountId: string | undefined,
  policy: PrivacyPolicyView,
): Promise<boolean> {
  return isCurrentAccepted(await local.get(accountId), policy);
}

export async function loadServerConsent(
  api: PrivacyApi,
  policy: PrivacyPolicyView,
  current: PrivacyConsentView | null,
  cachedAccepted: boolean,
): Promise<{
  consent: PrivacyConsentView | null;
  error: string | null;
  offlineCacheAllowed: boolean;
  localAccepted: boolean;
}> {
  try {
    const consent = await api.getConsent();
    return { consent, error: null, offlineCacheAllowed: false, localAccepted: isAccepted(consent, policy) };
  } catch (error: unknown) {
    const offlineCacheAllowed = isOfflineRecoverable(error);
    return {
      consent: null,
      error: privacyError(error),
      offlineCacheAllowed,
      localAccepted: offlineCacheAllowed && cachedAccepted,
    };
  }
}

export async function recordConsent(
  api: PrivacyApi,
  policy: PrivacyPolicyView,
  decision: PrivacyConsentDecision["decision"],
  deviceId: string,
  appVersion: string,
): Promise<PrivacyConsentView> {
  return api.recordConsent({
    policyVersion: policy.policyVersion,
    contentHash: policy.contentHash,
    decision,
    deviceId,
    appVersion,
  }, randomUUID());
}

export async function clearCachedConsent(
  local: PrivacyLocalStatePort,
  accountId: string,
): Promise<void> {
  if (local.clearAccountAndAnonymous) {
    await local.clearAccountAndAnonymous(accountId);
    return;
  }
  await local.clear(accountId);
  await local.clear();
}

export async function cacheServerConsent(
  local: PrivacyLocalStatePort,
  accountId: string,
  policy: PrivacyPolicyView,
  consent: PrivacyConsentView,
  now: () => Date,
): Promise<boolean> {
  if (!isAccepted(consent, policy)) {
    await clearCachedConsent(local, accountId);
    return false;
  }
  await local.set(accountId, {
    policyVersion: consent.policyVersion,
    contentHash: policy.contentHash,
    status: "accepted",
    acceptedAt: consent.acceptedAt,
    decisionAt: consent.decisionAt ?? now().toISOString(),
  });
  await local.clear();
  return true;
}

export async function recordAndCacheConsent(options: {
  api: PrivacyApi;
  local: PrivacyLocalStatePort;
  policy: PrivacyPolicyView;
  decision: PrivacyConsentDecision["decision"];
  deviceId: string;
  appVersion: string;
  accountId?: string;
  now: () => Date;
}): Promise<{ consent: PrivacyConsentView; localAccepted: boolean }> {
  if (options.accountId && options.decision !== "accept") {
    await clearCachedConsent(options.local, options.accountId);
  }
  const consent = await recordConsent(
    options.api,
    options.policy,
    options.decision,
    options.deviceId,
    options.appVersion,
  );
  let localAccepted = isAccepted(consent, options.policy);
  if (options.accountId) {
    localAccepted = await cacheServerConsent(
      options.local,
      options.accountId,
      options.policy,
      consent,
      options.now,
    );
  }
  return { consent, localAccepted };
}

