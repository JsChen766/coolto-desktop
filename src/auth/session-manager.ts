import {
  CooltoApiClient,
  CooltoApiError,
} from "../api/coolto-api-client.js";
import type {
  CurrentUser,
  LoginCredentials,
} from "../api/types.js";
import type { AuthSessionStore } from "./session-store.js";

export interface AuthenticatedUser {
  user: CurrentUser;
  restored: boolean;
}

export async function ensureAuthenticated(
  apiClient: CooltoApiClient,
  sessionStore: AuthSessionStore,
  apiBaseUrl: string,
  getCredentials: () => Promise<LoginCredentials>,
): Promise<AuthenticatedUser> {
  const storedSession = await sessionStore.load();
  if (storedSession) {
    apiClient.restoreSession(storedSession.accessToken);
    try {
      return {
        user: await apiClient.getCurrentUser(),
        restored: true,
      };
    } catch (error: unknown) {
      if (!(error instanceof CooltoApiError) || error.status !== 401) {
        throw error;
      }
      apiClient.clearSession();
      await sessionStore.clear();
    }
  }

  const credentials = await getCredentials();
  await apiClient.login(credentials);
  const user = await apiClient.getCurrentUser();

  try {
    await sessionStore.save({
      version: 1,
      apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
      accessToken: apiClient.getSessionToken(),
    });
  } catch (error: unknown) {
    await apiClient.logout().catch(() => undefined);
    throw error;
  }

  return { user, restored: false };
}
