export const JD_SOURCE_KINDS = [
  "manual",
  "pasted",
  "browser",
  "imported",
] as const;

export type JdSourceKind = typeof JD_SOURCE_KINDS[number];

export function normalizeJdSourceUrl(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length > 4096) throw new Error("JD 来源 URL 不能超过 4096 个字符");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("JD 来源 URL 必须是完整的 HTTP(S) 地址");
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("JD 来源 URL 只允许 HTTP(S) 地址");
  }
  if (url.username || url.password) {
    throw new Error("JD 来源 URL 不能包含用户名或密码");
  }
  return url.toString();
}
