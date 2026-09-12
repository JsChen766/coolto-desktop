import type {
  EmailChallengeAccepted,
  EmailChallengeInput,
  EmailLoginResult,
  EmailVerifyInput,
  LoginCredentials,
  LoginUser,
} from "./types.js";
import { CooltoApiError } from "./coolto-api-error.js";
import {
  extractAccessToken,
  isSafeAccessToken,
  readEnvelope,
} from "./api-transport-response.js";


export interface AuthenticatedRequester {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export class CooltoApiTransport implements AuthenticatedRequester {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  #sessionCookie: string | undefined;

  public constructor(baseUrl: string, fetchFn: typeof fetch) {
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#fetch = fetchFn;
  }

  public get isAuthenticated(): boolean {
    return this.#sessionCookie !== undefined;
  }

  public restoreSession(accessToken: string): void {
    if (!isSafeAccessToken(accessToken)) {
      throw new CooltoApiError(
        "本地保存的 access_token 格式无效",
        401,
        "invalid_local_session",
      );
    }
    this.#sessionCookie = `access_token=${accessToken}`;
  }

  public getSessionToken(): string {
    const token = this.#sessionCookie?.slice("access_token=".length);
    if (!token) {
      throw new CooltoApiError("尚未登录 Coolto", 401, "not_authenticated");
    }
    return token;
  }

  public clearSession(): void {
    this.#sessionCookie = undefined;
  }

  public async login(
    credentials: LoginCredentials,
    signal?: AbortSignal,
  ): Promise<LoginUser> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
      ...(signal ? { signal } : {}),
    });
    const data = await readEnvelope<LoginUser>(response);
    const accessToken = extractAccessToken(response.headers);
    if (!accessToken) {
      throw new CooltoApiError(
        "登录响应没有返回 access_token Cookie",
        response.status,
      );
    }
    this.restoreSession(accessToken);
    return data;
  }

  public requestEmailChallenge(
    input: EmailChallengeInput,
    signal?: AbortSignal,
  ): Promise<EmailChallengeAccepted> {
    return this.publicRequest<EmailChallengeAccepted>(
      "/v1/auth/email/challenges",
      input,
      signal,
    );
  }

  public async verifyEmailChallenge(
    input: EmailVerifyInput,
    signal?: AbortSignal,
  ): Promise<EmailLoginResult> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/auth/email/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    });
    const data = await readEnvelope<EmailLoginResult>(response);
    const accessToken = extractAccessToken(response.headers);
    if (!accessToken) {
      throw new CooltoApiError(
        "验证码登录响应没有返回 access_token Cookie",
        response.status,
      );
    }
    this.restoreSession(accessToken);
    return data;
  }

  public async logout(signal?: AbortSignal): Promise<void> {
    if (!this.#sessionCookie) return;
    try {
      await this.request<{ message: string }>("/v1/auth/logout", {
        method: "POST",
        ...(signal ? { signal } : {}),
      });
    } finally {
      this.#sessionCookie = undefined;
    }
  }

  public async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.#sessionCookie) {
      throw new CooltoApiError("尚未登录 Coolto", 401, "not_authenticated");
    }
    const headers = new Headers(init.headers);
    headers.set("cookie", this.#sessionCookie);
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
    });
    return readEnvelope<T>(response);
  }
  public async requestControl<T>(
    path: string,
    token: string,
    init: RequestInit = {},
  ): Promise<T> {
    if (!token.trim()) {
      throw new CooltoApiError(
        "删除控制令牌不能为空",
        401,
        "invalid_deletion_control",
      );
    }
    const headers = new Headers(init.headers);
    headers.delete("cookie");
    headers.set("X-Coolto-Deletion-Control", token);
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
    });
    return readEnvelope<T>(response);
  }
  public async requestAckReplay<T>(
    path: string,
    idempotencyKey: string,
    init: RequestInit = {},
  ): Promise<T> {
    if (!idempotencyKey.trim()) {
      throw new CooltoApiError(
        "删除确认幂等键不能为空",
        401,
        "invalid_deletion_ack",
      );
    }
    const headers = new Headers(init.headers);
    headers.delete("cookie");
    headers.set("Idempotency-Key", idempotencyKey);
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
    });
    return readEnvelope<T>(response);
  }

  private async publicRequest<T>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    return readEnvelope<T>(response);
  }

  /**
   * GET request with the session cookie, used for read-only endpoints such as
   * the public app configuration. Throws CooltoApiError on non-2xx responses.
   */
  public async getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const headers = this.#sessionCookie
      ? { Cookie: this.#sessionCookie }
      : {};
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method: "GET",
      headers,
      ...(signal ? { signal } : {}),
    });
    return readEnvelope<T>(response);
  }
}
