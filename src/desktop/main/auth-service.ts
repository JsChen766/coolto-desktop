import { app } from "electron";

import { AuthPrivacyCoordinator } from "./auth-helpers.js";
import { CooltoApiClient } from "../../api/coolto-api-client.js";
import type {
  CurrentUser,
  DeviceInput,
  EmailChallengeAccepted,
} from "../../api/types.js";
import { loadLocalEnv } from "../../config.js";
import {
  LOCAL_DESKTOP_ORIGIN,
  LOCAL_DESKTOP_TOKEN,
  createLocalDesktopUser,
} from "../../local-desktop.js";
import { createUuidV7 } from "../../sync/uuid-v7.js";
import { ElectronAuthSessionStore } from "./electron-auth-session-store.js";
import { createLocalDesktopPrivacyApi } from "./local-desktop-privacy-api.js";
import {
  LocalDesktopIdentityStore,
  localDesktopIdentityPath,
} from "./local-desktop-identity-store.js";
import { PrivacyService } from "./privacy/privacy-service.js";
import { PrivacyLocalState } from "./privacy/privacy-local-state.js";
import { DeletionRecoveryStore } from "./privacy/deletion-recovery-store.js";
import type { LocalSyncStore } from "./sync/local-sync-store.js";
import { DeviceIdentityStore } from "./sync/device-identity-store.js";
import { SyncRuntime } from "./sync/sync-runtime.js";
import {
  createPlanCheckout,
  getCheckoutPlans,
  verifyPlanCheckout,
} from "./auth-billing.js";
import {
  buildDeviceInput,
  saveAuthSession,
  startAuthSync,
} from "./auth-runtime-helpers.js";
export class DesktopAuthService {
  readonly apiClient: CooltoApiClient;
  readonly #apiBaseUrl: string;
  readonly #sessionStore: ElectronAuthSessionStore;
  readonly #deviceIdentities: DeviceIdentityStore;
  readonly #syncRuntime = new SyncRuntime();
  readonly privacy: PrivacyService;
  readonly #privacyCoordinator: AuthPrivacyCoordinator;
  #currentUser: CurrentUser | undefined;

  public constructor() {
    loadLocalEnv();
    this.#apiBaseUrl = LOCAL_DESKTOP_ORIGIN;
    this.apiClient = new CooltoApiClient({ baseUrl: this.#apiBaseUrl });
    this.privacy = new PrivacyService({
      api: createLocalDesktopPrivacyApi(),
      apiBaseUrl: this.#apiBaseUrl,
      localState: new PrivacyLocalState(this.#apiBaseUrl),
    });
    this.#sessionStore = new ElectronAuthSessionStore(this.#apiBaseUrl);
    this.#deviceIdentities = new DeviceIdentityStore();
    this.#privacyCoordinator = new AuthPrivacyCoordinator({
      privacy: this.privacy,
      saveSession: (user) => saveAuthSession(
        this.#sessionStore,
        this.apiClient,
        this.#apiBaseUrl,
        user,
      ),
      setCurrentUser: (user) => { this.#currentUser = user; },
      startSync: (user, networkEnabled) => startAuthSync(
        this.#syncRuntime,
        this.#apiBaseUrl,
        user,
        this.apiClient.sync,
        networkEnabled,
      ),
      stopSync: () => this.#syncRuntime.stop(),
      isRestrictedRecovery: (user) => DeletionRecoveryStore.hasRestricted(
        this.#apiBaseUrl,
        user.id,
      ),
    });
  }

  public async restore(): Promise<CurrentUser | undefined> {
    if (this.#currentUser) return this.#currentUser;
    const identity = await new LocalDesktopIdentityStore(
      localDesktopIdentityPath(app.getPath("userData")),
    ).loadOrCreate();
    const user = createLocalDesktopUser(identity.userId, identity.deviceId);
    this.apiClient.restoreSession(LOCAL_DESKTOP_TOKEN);
    await this.#privacyCoordinator.activate(user, false);
    return user;
  }

  public async requestEmailCode(email: string): Promise<EmailChallengeAccepted> {
    const device = await buildDeviceInput(this.#deviceIdentities, this.#apiBaseUrl, email);
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
    const device = await buildDeviceInput(this.#deviceIdentities, this.#apiBaseUrl, email);
    const { user: remoteUser } = await this.apiClient.verifyEmailChallenge(
      { challengeId, code, device },
      signal,
    );
    const user: CurrentUser = {
      ...remoteUser,
      status: remoteUser.status ?? "active",
      deviceId: remoteUser.deviceId ?? device.id,
    };
    await this.#privacyCoordinator.activate(user, true);
    return user;
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
    await this.#privacyCoordinator.activate(user, true);
    return user;
  }

  public async logout(): Promise<void> {
    await this.#syncRuntime.stop();
    await this.apiClient.logout().catch(() => undefined);
    await this.#sessionStore.clear();
    this.privacy.clearCurrentUser();
    this.#currentUser = undefined;
  }
  public get apiBaseUrl(): string {
    return this.#apiBaseUrl;
  }

  public requireCurrentUser(): CurrentUser {
    if (!this.#currentUser) throw new Error("请先登录 Coolto");
    return this.#currentUser;
  }

  public async resumeAfterPrivacy(): Promise<void> {
    const user = this.requireCurrentUser();
    if (!this.privacy.isCloudBusinessAllowed) {
      throw new Error("当前隐私同意尚未获得服务端确认");
    }
    if (!this.#syncRuntime.isStarted) {
      await startAuthSync(
        this.#syncRuntime,
        this.#apiBaseUrl,
        user,
        this.apiClient.sync,
        true,
      );
    }
  }
  public destroyLocalSync(): Promise<void> {
    return this.#syncRuntime.destroyLocal();
  }

  public async clearCurrentDeviceIdentity(accountEmail?: string): Promise<void> {
    const email = accountEmail ?? this.#currentUser?.email;
    if (!email) return;
    await this.#deviceIdentities.clear(this.#apiBaseUrl, email);
  }

  public async clearAuthSession(): Promise<void> {
    await this.privacy.clearLocalState();
    await this.#sessionStore.clear();
    this.apiClient.clearSession();
    this.privacy.clearCurrentUser();
    this.#currentUser = undefined;
  }

  public getCredits() {
    return {
      weeklyFreeCredits: 0,
      creditBalance: 0,
      planType: "NONE",
      hasFreeTrial: false,
      unlimited: true,
      recentTransactions: [],
    };
  }

  public getCheckoutPlans() {
    return getCheckoutPlans(this);
  }

  public createCheckout(planType: string) {
    return createPlanCheckout(this, planType);
  }

  public verifyCheckout(checkoutId: string) {
    return verifyPlanCheckout(this, checkoutId);
  }

  public requireSyncStore(): LocalSyncStore {
    this.requireCurrentUser();
    if (!this.privacy.isCloudBusinessAllowed) {
      throw new Error("请先完成当前版本的隐私同意");
    }
    return this.#syncRuntime.requireStore();
  }

  public triggerSync(): void {
    if (this.privacy.isCloudBusinessAllowed) this.#syncRuntime.trigger();
  }

  public syncNow(): Promise<void> {
    if (!this.privacy.isCloudBusinessAllowed) {
      return Promise.reject(new Error("当前隐私同意尚未获得服务端确认"));
    }
    return this.#syncRuntime.runNow();
  }

  public onSyncSettled(listener: () => void): () => void {
    return this.#syncRuntime.subscribe(listener);
  }

  public waitForInitialSync(): Promise<void> {
    return this.#syncRuntime.waitForInitial();
  }

  public dispose(): Promise<void> {
    return this.#syncRuntime.stop();
  }
}
