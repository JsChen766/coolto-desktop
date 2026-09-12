import { hostname } from "node:os";
import { CooltoApiError } from "../../api/coolto-api-error.js";
import { canRestoreOffline } from "../../auth/offline-session.js";
import type { StoredAuthSession } from "../../auth/session-store.js";

import type { CooltoApiClient } from "../../api/coolto-api-client.js";
import type { CurrentUser, DeviceInput } from "../../api/types.js";
import type { SyncApi } from "../../api/sync-api.js";
import type { DeviceIdentityStore } from "./sync/device-identity-store.js";
import type { SyncRuntime } from "./sync/sync-runtime.js";
import { desktopPlatform, withTimeout } from "./auth-helpers.js";
import type { ElectronAuthSessionStore } from "./electron-auth-session-store.js";
import type { AuthPrivacyCoordinator } from "./auth-helpers.js";

export async function restoreAuthSession(options: {
  currentUser: CurrentUser | undefined;
  loadSession(): Promise<StoredAuthSession | undefined>;
  clearSession(): Promise<void>;
  apiClient: CooltoApiClient;
  coordinator: AuthPrivacyCoordinator;
}): Promise<CurrentUser | undefined> {
  if (options.currentUser) return options.currentUser;
  const stored = await withTimeout(options.loadSession(), 4_000, "读取登录状态超时");
  if (!stored) return undefined;
  options.apiClient.restoreSession(stored.accessToken);
  try {
    const currentUser = await options.apiClient.getCurrentUser(AbortSignal.timeout(6_000));
    if (!currentUser.deviceId) {
      options.apiClient.clearSession();
      await options.clearSession();
      return undefined;
    }
    await options.coordinator.activate(currentUser, true);
    return currentUser;
  } catch (error: unknown) {
    if (error instanceof CooltoApiError && error.status === 401) {
      options.apiClient.clearSession();
      await options.clearSession();
      return undefined;
    }
    if (!canRestoreOffline(error, stored.currentUser)) throw error;
    await options.coordinator.activate(stored.currentUser, false);
    return stored.currentUser;
  }
}
export async function buildDeviceInput(
  identities: DeviceIdentityStore,
  apiBaseUrl: string,
  email: string,
): Promise<DeviceInput> {
  return {
    id: await identities.getOrCreate(apiBaseUrl, email),
    name: hostname().trim().slice(0, 120) || "Coolto Desktop",
    platform: desktopPlatform(),
    appVersion: process.env.npm_package_version ?? "0.1.0",
  };
}

export async function startAuthSync(
  runtime: SyncRuntime,
  apiBaseUrl: string,
  user: CurrentUser,
  api: SyncApi,
  networkEnabled: boolean,
): Promise<void> {
  if (!user.deviceId) throw new Error("当前登录状态缺少设备标识，请重新登录");
  await runtime.start(apiBaseUrl, user.id, user.deviceId, api, networkEnabled);
}

export function saveAuthSession(
  store: ElectronAuthSessionStore,
  apiClient: CooltoApiClient,
  apiBaseUrl: string,
  user: CurrentUser,
): Promise<void> {
  return store.save({
    version: 1,
    apiBaseUrl,
    accessToken: apiClient.getSessionToken(),
    currentUser: user,
  });
}
