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

export async function readEnvelope<T>(response: Response): Promise<T> {
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

export function extractAccessToken(headers: Headers): string | undefined {
  const headersWithCookies = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headersWithCookies.getSetCookie?.() ??
    (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  for (const cookie of setCookies) {
    const match = /(?:^|,\s*)access_token=([^;,\s]+)/.exec(cookie);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function isSafeAccessToken(value: string): boolean {
  return value.length > 0 && /^[A-Za-z0-9._~-]+$/.test(value);
}
