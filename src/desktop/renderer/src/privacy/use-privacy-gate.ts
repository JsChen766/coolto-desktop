import { computed, type Ref } from "vue";

import type { PrivacyDeletionState, PrivacyGateState } from "@desktop/types";

export interface PrivacyGateHost {
  privacyState: Ref<PrivacyGateState | undefined>;
  deletionState: Ref<PrivacyDeletionState | undefined>;
  acceptPrivacy(): Promise<void>;
  declinePrivacy(): Promise<void>;
}

export function usePrivacyGate(host: PrivacyGateHost) {
  const open = computed(() => {
    const state = host.privacyState.value;
    if (host.deletionState.value?.status === "completed") return false;
    const serverAccepted = state?.available && state.consent?.status === "accepted";
    return !serverAccepted || Boolean(state?.restrictedRecovery);
  });
  const recoveryOpen = computed(() =>
    host.deletionState.value?.status !== undefined &&
    host.deletionState.value.status !== "idle" &&
    host.deletionState.value.status !== "completed",
  );
  return {
    accept: host.acceptPrivacy,
    decline: host.declinePrivacy,
    deletionState: host.deletionState,
    open,
    recoveryOpen,
    state: host.privacyState,
  };
}
