import type { CurrentUser } from "../../../api/types.js";
import type { PrivacyApi } from "../../../api/privacy-api.js";
import { BUNDLED_PRIVACY_POLICY } from "../../../privacy/policy.js";
import type {
  PrivacyConsentDecision,
  PrivacyConsentView,
  PrivacyPolicyView,
} from "../../../privacy/types.js";
import type { PrivacyGateState } from "../../shared/types/privacy.js";
import {
  cacheServerConsent,
  clearCachedConsent,
  loadServerConsent,
  recordAndCacheConsent,
  refreshPrivacyPolicy,
  type PrivacyLocalStatePort,
} from "./privacy-service-policy.js";
import { emitPrivacyState } from "./privacy-service-events.js";
import { readPrivacyGateState } from "./privacy-service-gate.js";
import {
  acceptedEntry,
  consentView,
  isAccepted,
  isCurrentAccepted,
} from "./privacy-state-helpers.js";
export type { PrivacyLocalStatePort } from "./privacy-service-policy.js";
export interface PrivacyServiceOptions {
  api: PrivacyApi;
  apiBaseUrl: string;
  localState: PrivacyLocalStatePort;
  appVersion?: string;
  now?: () => Date;
}
export class PrivacyService {
  readonly #api: PrivacyApi;
  readonly #local: PrivacyLocalStatePort;
  readonly #appVersion: string;
  readonly #now: () => Date;
  readonly #listeners = new Set<(state: PrivacyGateState) => void>();
  #user: CurrentUser | undefined;
  #policy: PrivacyPolicyView = BUNDLED_PRIVACY_POLICY;
  #consent: PrivacyConsentView | null = null;
  #available = false;
  #error: string | null = null;
  #localAccepted = false;
  #offlineCacheAllowed = false;
  #restrictedRecovery = false;
  public constructor(options: PrivacyServiceOptions) {
    this.#api = options.api;
    this.#local = options.localState;
    this.#appVersion = options.appVersion ?? process.env.npm_package_version ?? "0.1.0";
    this.#now = options.now ?? (() => new Date());
  }
  public async getState(accountId = this.#user?.id): Promise<PrivacyGateState> {
    const snapshot = await readPrivacyGateState({
      api: this.#api,
      local: this.#local,
      accountId,
      currentConsent: this.#consent,
    });
    this.#policy = snapshot.policy;
    this.#consent = snapshot.consent;
    this.#available = snapshot.available;
    this.#error = snapshot.error;
    this.#localAccepted = snapshot.localAccepted;
    this.#offlineCacheAllowed = snapshot.offlineCacheAllowed;
    this.#emit();
    return this.state();
  }
  public async prepareForUser(user: CurrentUser, deviceId: string): Promise<boolean> {
    this.#user = user;
    const ownerLocal = await this.#local.get(user.id);
    const anonymousLocal = ownerLocal ? undefined : await this.#local.get();
    const local = ownerLocal ?? anonymousLocal;
    const policy = await refreshPrivacyPolicy(this.#api);
    this.#policy = policy.policy;
    this.#available = policy.available;
    this.#consent = policy.available ? this.#consent : null;
    this.#offlineCacheAllowed = policy.offlineCacheAllowed;
    this.#error = policy.error;
    this.#localAccepted = isCurrentAccepted(local, this.#policy);
    if (!this.#available) {
      this.#localAccepted = this.#offlineCacheAllowed && this.#localAccepted;
      this.#emit();
      return this.#localAccepted;
    }
    const loaded = await loadServerConsent(
      this.#api,
      this.#policy,
      this.#consent,
      this.#localAccepted,
    );
    this.#consent = loaded.consent;
    this.#error = loaded.error;
    this.#offlineCacheAllowed = loaded.offlineCacheAllowed;
    this.#localAccepted = loaded.localAccepted;
    if (loaded.error && !loaded.offlineCacheAllowed) {
      this.#available = false;
      this.#consent = null;
      this.#localAccepted = false;
    }
    if (loaded.error) {
      this.#emit();
      return this.#localAccepted;
    }
    const server = loaded.consent;
    if (server && isAccepted(server, this.#policy)) {
      this.#localAccepted = await cacheServerConsent(
        this.#local,
        user.id,
        this.#policy,
        server,
        this.#now,
      );
      this.#emit();
      return true;
    }
    if (server) {
      await clearCachedConsent(this.#local, user.id);
      this.#localAccepted = false;
    }
    if (
      server?.status === "required" &&
      !ownerLocal &&
      isCurrentAccepted(anonymousLocal, this.#policy)
    ) {
      const accepted = await this.#record("accept", deviceId);
      return isAccepted(accepted, this.#policy);
    }
    this.#emit();
    return false;
  }
  public async accept(deviceId = this.#user?.deviceId ?? "prelogin-device"): Promise<PrivacyGateState> {
    if (!this.#available) throw new Error(this.#error ?? "当前隐私政策不可用");
    if (!this.#user) {
      await this.#local.set(undefined, acceptedEntry(this.#policy, this.#now()));
      this.#localAccepted = true;
      this.#consent = consentView(this.#policy, "accepted", this.#now());
      this.#emit();
      return this.state();
    }
    await this.#record("accept", deviceId);
    return this.state();
  }
  public async decline(deviceId = this.#user?.deviceId ?? "prelogin-device"): Promise<PrivacyGateState> {
    if (!this.#available) throw new Error(this.#error ?? "当前隐私政策不可用");
    if (!this.#user) {
      await this.#local.clear();
      this.#localAccepted = false;
      this.#consent = consentView(this.#policy, "declined", this.#now());
      this.#emit();
      return this.state();
    }
    await this.#record("decline", deviceId);
    return this.state();
  }
  public onStateChange(listener: (state: PrivacyGateState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  public state(): PrivacyGateState {
    return {
      available: this.#available,
      policy: structuredClone(this.#policy),
      consent: this.#consent ? structuredClone(this.#consent) : null,
      localAccepted: this.#localAccepted,
      error: this.#error,
      restrictedRecovery: this.#restrictedRecovery,
    };
  }
  public requireBusinessAccess(): void {
    if (!this.isBusinessAllowed) {
      throw new Error(this.#error ?? "请先完成当前版本的隐私同意");
    }
  }
  public get isBusinessAllowed(): boolean {
    return this.isCloudBusinessAllowed;
  }
  public get isCloudBusinessAllowed(): boolean {
    return !this.#restrictedRecovery && this.isServerConsentVerified;
  }
  public requireCloudBusinessAccess(): void {
    if (!this.isCloudBusinessAllowed) {
      throw new Error("请先完成当前版本的隐私同意");
    }
  }
  public get isServerConsentVerified(): boolean {
    return this.#available && isAccepted(this.#consent, this.#policy);
  }
  public get hasCurrentUser(): boolean {
    return this.#user !== undefined;
  }
  public get isFeatureAvailable(): boolean {
    return this.#available;
  }
  public get isOfflineLocalOnly(): boolean {
    return !this.#restrictedRecovery &&
      this.#offlineCacheAllowed && this.#localAccepted;
  }
  public get isRestrictedRecovery(): boolean { return this.#restrictedRecovery; }
  public setRestrictedRecovery(value: boolean): void {
    if (this.#restrictedRecovery === value) return;
    this.#restrictedRecovery = value;
    this.#emit();
  }
  public async clearLocalState(): Promise<void> {
    await this.#local.clear(this.#user?.id);
    await this.#local.clear();
  }
  public clearLocalStateForOwner(ownerId: string): Promise<void> { return this.#local.clear(ownerId); }

  public clearCurrentUser(): void {
    this.#user = undefined;
    this.#consent = null;
    this.#localAccepted = false;
    this.#restrictedRecovery = false;
    this.#emit();
  }

  async #record(
    decision: PrivacyConsentDecision["decision"],
    deviceId: string,
  ): Promise<PrivacyConsentView> {
    try {
      const recorded = await recordAndCacheConsent({
        api: this.#api,
        local: this.#local,
        policy: this.#policy,
        decision,
        deviceId,
        appVersion: this.#appVersion,
        ...(this.#user ? { accountId: this.#user.id } : {}),
        now: this.#now,
      });
      this.#consent = recorded.consent;
      this.#localAccepted = recorded.localAccepted;
      this.#emit();
      return recorded.consent;
    } catch (error: unknown) {
      if (decision !== "accept") {
        this.#localAccepted = false;
        this.#consent = consentView(this.#policy, decision === "withdraw" ? "withdrawn" : "declined", this.#now());
        this.#emit();
      }
      throw error;
    }
  }

  #emit(): void { emitPrivacyState(this.#listeners, this.state()); }
}
