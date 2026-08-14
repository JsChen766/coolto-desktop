import { hostname } from "node:os";

import { CooltoApiClient, CooltoApiError } from "../../api/coolto-api-client.js";
import type {
  CurrentUser,
  DeviceInput,
  EmailChallengeAccepted,
} from "../../api/types.js";
import { loadLocalEnv, readApiBaseUrl, readConfig } from "../../config.js";
import { createUuidV7 } from "../../sync/uuid-v7.js";
import { ElectronAuthSessionStore } from "./electron-auth-session-store.js";
import { canRestoreOffline } from "../../auth/offline-session.js";
import type { LocalSyncStore } from "./sync/local-sync-store.js";
import { DeviceIdentityStore } from "./sync/device-identity-store.js";
import { SyncRuntime } from "./sync/sync-runtime.js";
import { fetchCreditSummary } from "./credit-api-client.js";
import {
  createCheckout,
  fetchPlans,
  verifyCheckout,
} from "./checkout-api-client.js";

export class DesktopAuthService {
  readonly apiClient: CooltoApiClient;
  readonly #apiBaseUrl: string;
  readonly #sessionStore: ElectronAuthSessionStore;
  readonly #deviceIdentities: DeviceIdentityStore;
  readonly #syncRuntime = new SyncRuntime();
  #currentUser: CurrentUser | undefined;

  public constructor() {
    loadLocalEnv();
    this.#apiBaseUrl = readApiBaseUrl().replace(/\/+$/, "");
    this.apiClient = new CooltoApiClient({ baseUrl: this.#apiBaseUrl });
    this.#sessionStore = new ElectronAuthSessionStore(this.#apiBaseUrl);
    this.#deviceIdentities = new DeviceIdentityStore();
  }

  public async restore(): Promise<CurrentUser | undefined> {
    if (this.#currentUser) {
      return this.#currentUser;
    }

    const stored = await withTimeout(
      this.#sessionStore.load(),
      4_000,
      "读取登录状态超时",
    );
    if (!stored) {
      return undefined;
    }

    this.apiClient.restoreSession(stored.accessToken);
    try {
      const currentUser = await this.apiClient.getCurrentUser(
        AbortSignal.timeout(6_000),
      );
      if (!currentUser.deviceId) {
        this.apiClient.clearSession();
        await this.#sessionStore.clear();
        return undefined;
      }
      await this.#saveSession(currentUser);
      await this.#startSync(currentUser);
      this.#currentUser = currentUser;
      return currentUser;
    } catch (error: unknown) {
      if (error instanceof CooltoApiError && error.status === 401) {
        this.apiClient.clearSession();
        await this.#sessionStore.clear();
        return undefined;
      }
      if (!canRestoreOffline(error, stored.currentUser)) {
        throw error;
      }
      await this.#startSync(stored.currentUser);
      this.#currentUser = stored.currentUser;
      return stored.currentUser;
    }
  }

  public async login(email: string, password: string): Promise<CurrentUser> {
    const signal = AbortSignal.timeout(15_000);
    const device = await this.#deviceInput(email);
    await this.apiClient.login({ email, password, device }, signal);
    return this.#completeLogin(device, signal);
  }

  public async requestEmailCode(email: string): Promise<EmailChallengeAccepted> {
    const device = await this.#deviceInput(email);
    return this.apiClient.requestEmailChallenge(
      {
        challengeId: createUuidV7(),
        email,
        purpose: "login",
        device,
      },
      AbortSignal.timeout(15_000),
    );
  }

  public async verifyEmailCode(
    email: string,
    challengeId: string,
    code: string,
  ): Promise<CurrentUser> {
    const signal = AbortSignal.timeout(15_000);
    const device = await this.#deviceInput(email);
    await this.apiClient.verifyEmailChallenge(
      { challengeId, code, device },
      signal,
    );
    return this.#completeLogin(device, signal);
  }

  async #completeLogin(
    device: DeviceInput,
    signal: AbortSignal,
  ): Promise<CurrentUser> {
    const remoteUser = await this.apiClient.getCurrentUser(signal);
    const user: CurrentUser = {
      ...remoteUser,
      status: remoteUser.status ?? "active",
      deviceId: remoteUser.deviceId ?? device.id,
    };
    await this.#saveSession(user);
    await this.#startSync(user);
    this.#currentUser = user;
    return user;
  }

  public async logout(): Promise<void> {
    await this.#syncRuntime.stop();
    await this.apiClient.logout().catch(() => undefined);
    await this.#sessionStore.clear();
    this.#currentUser = undefined;
  }

  public requireCurrentUser(): CurrentUser {
    if (!this.#currentUser) {
      throw new Error("请先登录 Coolto");
    }
    return this.#currentUser;
  }

  public getCredits() {
    this.requireCurrentUser();
    const baseUrl = readConfig().llmGatewayBaseUrl;
    if (!baseUrl) throw new Error("尚未配置 Coolto Credit API");
    return fetchCreditSummary(baseUrl, this.apiClient.getSessionToken());
  }

  public getCheckoutPlans() {
    this.requireCurrentUser();
    const baseUrl = readConfig().llmGatewayBaseUrl;
    if (!baseUrl) throw new Error("尚未配置 Coolto Credit API");
    return fetchPlans(baseUrl, this.apiClient.getSessionToken());
  }

  public createCheckout(planType: string) {
    this.requireCurrentUser();
    const baseUrl = readConfig().llmGatewayBaseUrl;
    if (!baseUrl) throw new Error("尚未配置 Coolto Credit API");
    return createCheckout(baseUrl, this.apiClient.getSessionToken(), planType);
  }

  public verifyCheckout(checkoutId: string) {
    this.requireCurrentUser();
    const baseUrl = readConfig().llmGatewayBaseUrl;
    if (!baseUrl) throw new Error("尚未配置 Coolto Credit API");
    return verifyCheckout(baseUrl, this.apiClient.getSessionToken(), checkoutId);
  }

  public requireSyncStore(): LocalSyncStore {
    this.requireCurrentUser();
    return this.#syncRuntime.requireStore();
  }

  public triggerSync(): void {
    this.#syncRuntime.trigger();
  }

  public syncNow(): Promise<void> {
    return this.#syncRuntime.runNow();
  }

  public waitForInitialSync(): Promise<void> {
    return this.#syncRuntime.waitForInitial();
  }

  public dispose(): Promise<void> {
    return this.#syncRuntime.stop();
  }

  async #deviceInput(email: string): Promise<DeviceInput> {
    return {
      id: await this.#deviceIdentities.getOrCreate(this.#apiBaseUrl, email),
      name: hostname().trim().slice(0, 120) || "Coolto Desktop",
      platform: desktopPlatform(),
      appVersion: process.env.npm_package_version ?? "0.1.0",
    };
  }

  async #startSync(user: CurrentUser): Promise<void> {
    if (!user.deviceId) throw new Error("当前登录状态缺少设备标识，请重新登录");
    await this.#syncRuntime.start(
      this.#apiBaseUrl,
      user.id,
      user.deviceId,
      this.apiClient.sync,
    );
  }

  #saveSession(user: CurrentUser): Promise<void> {
    return this.#sessionStore.save({
      version: 1,
      apiBaseUrl: this.#apiBaseUrl,
      accessToken: this.apiClient.getSessionToken(),
      currentUser: user,
    });
  }
}

function desktopPlatform(): DeviceInput["platform"] {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return "linux";
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
