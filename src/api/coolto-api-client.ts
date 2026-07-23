import type {
  CurrentUser,
  CurrentUserReader,
  ExperienceDetail,
  ExperienceReader,
  ExperienceSearchOptions,
  ExperienceSearchResult,
  LoginCredentials,
  LoginUser,
} from "./types.js";

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  request_id?: string;
}

interface ErrorEnvelope {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
  request_id?: string;
}

export class CooltoApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "CooltoApiError";
  }
}

export interface CooltoApiClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

export class CooltoApiClient implements CurrentUserReader, ExperienceReader {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  #sessionCookie: string | undefined;

  public constructor(options: CooltoApiClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#fetch = options.fetchFn ?? globalThis.fetch;
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
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(credentials),
      ...(signal ? { signal } : {}),
    });

    const data = await this.#readEnvelope<LoginUser>(response);
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

  public async getCurrentUser(
    signal?: AbortSignal,
  ): Promise<CurrentUser> {
    return this.#request<CurrentUser>("/v1/users/me", {
      ...(signal ? { signal } : {}),
    });
  }

  public async searchExperiences(
    options: ExperienceSearchOptions = {},
    signal?: AbortSignal,
  ): Promise<ExperienceSearchResult> {
    const query = new URLSearchParams();
    if (options.q) {
      query.set("q", options.q);
    }
    if (options.category) {
      query.set("category", options.category);
    }
    for (const tag of options.tags ?? []) {
      query.append("tags", tag);
    }
    if (options.limit !== undefined) {
      query.set("limit", String(options.limit));
    }
    if (options.cursor) {
      query.set("cursor", options.cursor);
    }

    const queryString = query.toString();
    return this.#request<ExperienceSearchResult>(
      `/v1/product/experiences${queryString ? `?${queryString}` : ""}`,
      {
        ...(signal ? { signal } : {}),
      },
    );
  }

  public async getExperience(
    experienceId: string,
    signal?: AbortSignal,
  ): Promise<ExperienceDetail> {
    const normalizedId = experienceId.trim();
    if (!normalizedId) {
      throw new Error("experienceId 不能为空");
    }
    return this.#request<ExperienceDetail>(
      `/v1/product/experiences/${encodeURIComponent(normalizedId)}`,
      {
        ...(signal ? { signal } : {}),
      },
    );
  }

  public async logout(signal?: AbortSignal): Promise<void> {
    if (!this.#sessionCookie) {
      return;
    }

    try {
      await this.#request<{ message: string }>("/v1/auth/logout", {
        method: "POST",
        ...(signal ? { signal } : {}),
      });
    } finally {
      this.#sessionCookie = undefined;
    }
  }

  async #request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    if (!this.#sessionCookie) {
      throw new CooltoApiError("尚未登录 Coolto", 401, "not_authenticated");
    }

    const headers = new Headers(init.headers);
    headers.set("cookie", this.#sessionCookie);

    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
    });
    return this.#readEnvelope<T>(response);
  }

  async #readEnvelope<T>(response: Response): Promise<T> {
    let payload: SuccessEnvelope<T> | ErrorEnvelope | undefined;
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
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

function isSafeAccessToken(value: string): boolean {
  return value.length > 0 && /^[A-Za-z0-9._~-]+$/.test(value);
}
