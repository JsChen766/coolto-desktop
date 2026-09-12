import type { CurrentUser, DeviceInput } from "../../api/types.js";
import type { PrivacyService } from "./privacy/privacy-service.js";

export interface AuthPrivacyCoordinatorOptions {
  privacy: PrivacyService;
  saveSession(user: CurrentUser): Promise<void>;
  setCurrentUser(user: CurrentUser): void;
  startSync(user: CurrentUser, networkEnabled: boolean): Promise<void>;
  stopSync?(): Promise<void>;
  isRestrictedRecovery(user: CurrentUser): Promise<boolean>;
}

export class AuthPrivacyCoordinator {
  readonly #privacy: PrivacyService;
  readonly #saveSession: AuthPrivacyCoordinatorOptions["saveSession"];
  readonly #setCurrentUser: AuthPrivacyCoordinatorOptions["setCurrentUser"];
  readonly #startSync: AuthPrivacyCoordinatorOptions["startSync"];
  readonly #stopSync: AuthPrivacyCoordinatorOptions["stopSync"];
  readonly #isRestrictedRecovery: AuthPrivacyCoordinatorOptions["isRestrictedRecovery"];

  public constructor(options: AuthPrivacyCoordinatorOptions) {
    this.#privacy = options.privacy;
    this.#saveSession = options.saveSession;
    this.#setCurrentUser = options.setCurrentUser;
    this.#startSync = options.startSync;
    this.#stopSync = options.stopSync;
    this.#isRestrictedRecovery = options.isRestrictedRecovery;
  }

  public async activate(user: CurrentUser, networkEnabled: boolean): Promise<void> {
    if (!user.deviceId) throw new Error("当前登录状态缺少设备标识，请重新登录");
    await this.#stopSync?.();
    await this.#saveSession(user);
    this.#setCurrentUser(user);
    if (user.status && user.status !== "active") {
      this.#privacy.setRestrictedRecovery(true);
      return;
    }
    const restricted = await this.#isRestrictedRecovery(user);
    this.#privacy.setRestrictedRecovery(restricted);
    if (restricted) return;
    const allowed = await this.#privacy.prepareForUser(user, user.deviceId);
    if (allowed && this.#privacy.isServerConsentVerified) {
      await this.#startSync(user, networkEnabled);
    }
  }
}

export function desktopPlatform(): DeviceInput["platform"] {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return "linux";
}

export async function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
