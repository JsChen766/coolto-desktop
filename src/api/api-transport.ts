import type {
  EmailChallengeAccepted,
  EmailChallengeInput,
  EmailLoginResult,
  EmailVerifyInput,
  LoginCredentials,
  LoginUser,
} from "./types.js";
import { CooltoApiError } from "./coolto-api-error.js";

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  request_id?: string;
}

interface ErrorEnvelope {
  success: false;
  error?: { code?: string; message?: string };
  request_id?: string;
}

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
}

async function readEnvelope<T>(response: Response): Promise<T> {
  let payload: SuccessEnvelope<T> | ErrorEnvelope;
  try {
    payload = (await response.json()) as SuccessEnvelope<T> | ErrorEnvelope;
  } catch {
    throw new CooltoApiError(
      `后端返回了无法解析的响应（HTTP ${response.status}）`,
      response.status,
    );
  }
  if (!response.ok || payload.success !== true) {
    const errorPayload = payload as ErrorEnvelope;
    throw new CooltoApiError(
      errorPayload.error?.message ?? `后端请求失败（HTTP ${response.status}）`,
      response.status,
      errorPayload.error?.code,
    );
  }
  return payload.data;
}

function extractAccessToken(headers: Headers): string | undefined {
  const headersWithCookies = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies =
    headersWithCookies.getSetCookie?.() ??
    (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  for (const cookie of setCookies) {
    const match = /(?:^|,\s*)access_token=([^;,\s]+)/.exec(cookie);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function isSafeAccessToken(value: string): boolean {
  return value.length > 0 && /^[A-Za-z0-9._~-]+$/.test(value);
}
