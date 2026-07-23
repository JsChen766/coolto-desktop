import { CooltoApiClient, CooltoApiError } from "../../api/coolto-api-client.js";
import type { CurrentUser } from "../../api/types.js";
import { loadLocalEnv, readApiBaseUrl } from "../../config.js";
import { ElectronAuthSessionStore } from "./electron-auth-session-store.js";

export class DesktopAuthService {
  readonly apiClient: CooltoApiClient;
  readonly #sessionStore: ElectronAuthSessionStore;
  #currentUser: CurrentUser | undefined;

  public constructor() {
    loadLocalEnv();
    const apiBaseUrl = readApiBaseUrl();
    this.apiClient = new CooltoApiClient({ baseUrl: apiBaseUrl });
    this.#sessionStore = new ElectronAuthSessionStore(apiBaseUrl);
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
      this.#currentUser = await this.apiClient.getCurrentUser(
        AbortSignal.timeout(6_000),
      );
      return this.#currentUser;
    } catch (error: unknown) {
      if (!(error instanceof CooltoApiError) || error.status !== 401) {
        throw error;
      }
      this.apiClient.clearSession();
      await this.#sessionStore.clear();
      return undefined;
    }
  }

  public async login(email: string, password: string): Promise<CurrentUser> {
    const signal = AbortSignal.timeout(15_000);
    await this.apiClient.login({ email, password }, signal);
    const user = await this.apiClient.getCurrentUser(signal);
    await this.#sessionStore.save({
      version: 1,
      apiBaseUrl: readApiBaseUrl().replace(/\/+$/, ""),
      accessToken: this.apiClient.getSessionToken(),
    });
    this.#currentUser = user;
    return user;
  }

  public async logout(): Promise<void> {
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
