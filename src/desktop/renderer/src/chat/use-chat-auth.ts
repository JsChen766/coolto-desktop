import { ref } from "vue";

import type { DesktopUser, EmailChallengeView } from "@desktop/types";
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
  const loginBusy = ref(false);
  const loginError = ref<string>();
  const emailChallenge = ref<EmailChallengeView>();

  async function restore(): Promise<void> {
    try {
      user.value = await desktopApi.auth.getCurrentUser();
      if (user.value) await onAuthenticated();
    } catch (error: unknown) {
      loginError.value = translate(desktopErrorMessage(error));
    } finally {
      booting.value = false;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    await runLogin(async () => desktopApi.auth.login(email, password));
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
    onLogout();
  }

  async function runLogin(
    authenticate: () => Promise<DesktopUser>,
  ): Promise<boolean> {
    loginBusy.value = true;
    loginError.value = undefined;
    try {
      user.value = await authenticate();
      await onAuthenticated();
      return true;
    } catch (error: unknown) {
      loginError.value = translate(desktopErrorMessage(error));
      return false;
    } finally {
      loginBusy.value = false;
    }
  }

  return {
    booting,
    emailChallenge,
    login,
    loginBusy,
    loginError,
    logout,
    requestEmailCode,
    restore,
    user,
    verifyEmailCode,
  };
}
