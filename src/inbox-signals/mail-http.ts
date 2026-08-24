export class MailHttpError extends Error {
  public constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchMailJson(
  url: string,
  accessToken: string,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, ...headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new MailHttpError(response.status, `Mail API ${response.status}: ${body}`);
  }
  return response.json() as Promise<unknown>;
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 响应无效`);
  }
  return value as Record<string, unknown>;
}

export function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} 缺失`);
  return value;
}
