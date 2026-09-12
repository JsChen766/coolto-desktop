import { onBeforeUnmount, ref } from "vue";

import type {
  DesktopUser,
  EmailChallengeView,
  PrivacyDeletionState,
  PrivacyGateState,
} from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";
import { desktopErrorMessage } from "./desktop-error-message";
import { translate } from "../i18n/locale";

export function useChatAuth(
  onAuthenticated: () => Promise<void>,
  onLogout: () => void,
  cancelRunning: () => Promise<void>,
) {
  const booting = ref(true);
  const user = ref<DesktopUser>();
  const privacyState = ref<PrivacyGateState>();
  const deletionState = ref<PrivacyDeletionState>();
  const loginBusy = ref(false);
  const loginError = ref<string>();
  const emailChallenge = ref<EmailChallengeView>();
  const unsubscribeDeletion = desktopApi.privacy.onDeletionStateChange((state) => {
    deletionState.value = state;
    if (state.status !== "idle" && state.status !== "awaiting_control_ack" && user.value) {
      user.value = undefined;
      privacyState.value = undefined;
      onLogout();
    }
  });
  const unsubscribePrivacy = desktopApi.privacy.onStateChange((state) => {
    privacyState.value = state;
    if (state.restrictedRecovery) void refreshDeletion().catch(() => undefined);
  });
  onBeforeUnmount(() => {
    unsubscribeDeletion();
    unsubscribePrivacy();
  });

  async function refreshPrivacy(): Promise<void> {
    privacyState.value = await desktopApi.privacy.getState();
  }

  async function refreshDeletion(): Promise<void> {
    deletionState.value = await desktopApi.privacy.getDeletionState();
  }

  function privacyAccepted(): boolean {
    const state = privacyState.value;
    return Boolean(!state?.restrictedRecovery &&
      state?.available && state.consent?.status === "accepted");
  }

  function deletionActive(): boolean {
    return Boolean(deletionState.value && deletionState.value.status !== "idle");
  }

  async function restore(): Promise<void> {
    try {
      user.value = await desktopApi.auth.getCurrentUser();
      await refreshPrivacy();
      await refreshDeletion();
      if (user.value && !deletionActive() && privacyAccepted()) {
        await onAuthenticated();
      }
    } catch (error: unknown) {
      loginError.value = translate(desktopErrorMessage(error));
    } finally {
      booting.value = false;
    }
  }

  async function acceptPrivacy(): Promise<void> {
    loginBusy.value = true;
    loginError.value = undefined;
    try {
      privacyState.value = await desktopApi.privacy.accept();
      if (user.value && privacyAccepted() && !deletionActive()) await onAuthenticated();
    } catch (error: unknown) {
      loginError.value = translate(desktopErrorMessage(error));
    } finally {
      loginBusy.value = false;
    }
  }

  async function declinePrivacy(): Promise<void> {
    loginBusy.value = true;
    loginError.value = undefined;
    try {
      privacyState.value = await desktopApi.privacy.decline();
    } catch (error: unknown) {
      loginError.value = translate(desktopErrorMessage(error));
    } finally {
      loginBusy.value = false;
    }
  }

  async function requestEmailCode(email: string): Promise<void> {
    loginBusy.value = true;
    loginError.value = undefined;
    try {
      emailChallenge.value = await desktopApi.auth.requestEmailCode(email);
    } catch (error: unknown) {
      loginError.value = translate(desktopErrorMessage(error));
    } finally {
      loginBusy.value = false;
    }
  }

  async function verifyEmailCode(
    email: string,
    challengeId: string,
    code: string,
  ): Promise<void> {
    const authenticated = await runLogin(() =>
      desktopApi.auth.verifyEmailCode(email, challengeId, code),
    );
    if (authenticated) emailChallenge.value = undefined;
  }

  async function logout(): Promise<void> {
    await cancelRunning();
    await desktopApi.auth.logout();
    user.value = undefined;
    privacyState.value = undefined;
    deletionState.value = undefined;
    onLogout();
    await refreshPrivacy().catch(() => undefined);
  }

  async function runLogin(
    authenticate: () => Promise<DesktopUser>,
  ): Promise<boolean> {
    loginBusy.value = true;
    loginError.value = undefined;
    try {
      user.value = await authenticate();
      localStorage.setItem("coolto-visited", "1");
      await refreshPrivacy();
      await refreshDeletion();
      if (!deletionActive() && privacyAccepted()) await onAuthenticated();
      return true;
    } catch (error: unknown) {
      loginError.value = translate(desktopErrorMessage(error));
      return false;
    } finally {
      loginBusy.value = false;
    }
  }

  return {
    acceptPrivacy,
    booting,
    declinePrivacy,
    deletionState,
    emailChallenge,
    loginBusy,
    loginError,
    logout,
    privacyState,
    refreshDeletion,
    refreshPrivacy,
    requestEmailCode,
    restore,
    user,
    verifyEmailCode,
  };
}
