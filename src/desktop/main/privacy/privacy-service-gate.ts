import type { PrivacyApi } from "../../../api/privacy-api.js";
import type { PrivacyConsentView, PrivacyPolicyView } from "../../../privacy/types.js";
import {
  clearCachedConsent,
  loadCachedAcceptance,
  loadServerConsent,
  refreshPrivacyPolicy,
  type PrivacyLocalStatePort,
} from "./privacy-service-policy.js";
import { isAccepted } from "./privacy-state-helpers.js";

export interface PrivacyGateSnapshot {
  policy: PrivacyPolicyView;
  consent: PrivacyConsentView | null;
  available: boolean;
  error: string | null;
  localAccepted: boolean;
  offlineCacheAllowed: boolean;
}

export async function readPrivacyGateState(options: {
  api: PrivacyApi;
  local: PrivacyLocalStatePort;
  accountId: string | undefined;
  currentConsent: PrivacyConsentView | null;
}): Promise<PrivacyGateSnapshot> {
  const policy = await refreshPrivacyPolicy(options.api);
  let consent = policy.available ? options.currentConsent : null;
  let available = policy.available;
  let error = policy.error;
  let offlineCacheAllowed = policy.offlineCacheAllowed;
  const cachedAccepted = await loadCachedAcceptance(options.local, options.accountId, policy.policy);
  let localAccepted = (available || offlineCacheAllowed) && cachedAccepted;
  if (options.accountId && available) {
    const loaded = await loadServerConsent(
      options.api,
      policy.policy,
      consent,
      localAccepted,
    );
    consent = loaded.consent;
    error = loaded.error;
    offlineCacheAllowed = loaded.offlineCacheAllowed;
    localAccepted = loaded.localAccepted;
    if (loaded.consent && !isAccepted(loaded.consent, policy.policy)) {
      await clearCachedConsent(options.local, options.accountId);
      localAccepted = false;
    }
    if (loaded.error && !loaded.offlineCacheAllowed) {
      available = false;
      consent = null;
      localAccepted = false;
    }
  }
  return {
    policy: policy.policy,
    consent,
    available,
    error,
    localAccepted,
    offlineCacheAllowed,
  };
}
