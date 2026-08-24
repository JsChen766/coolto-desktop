const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Agent navigation only accepts explicit HTTP(S) URLs. */
export function normalizeAgentNavigationUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("导航 URL 不能为空");
  if (value.length > 4096) throw new Error("导航 URL 过长");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Agent 导航必须使用完整的 http:// 或 https:// URL");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error("Agent 只能导航到 HTTP(S) 页面");
  }
  if (url.username || url.password) {
    throw new Error("Agent 导航 URL 不得包含用户名或密码");
  }
  return url.toString();
}
