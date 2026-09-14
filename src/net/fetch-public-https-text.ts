import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { htmlToVisibleText } from "./html-visible-text.js";
import {
  assertPublicHttpsUrl,
  isPrivateOrLocalIp,
} from "./public-https-policy.js";

export const PUBLIC_HTTPS_MAX_BYTES = 200_000;
const TIMEOUT_MS = 12_000;
const MAX_HOPS = 4;

export interface PublicHttpsLookup {
  (hostname: string): Promise<Array<{ address: string }>>;
}

export interface PublicHttpsFetch {
  (url: string, init: RequestInit): Promise<Response>;
}

export async function fetchPublicHttpsText(
  raw: string,
  deps?: { lookup?: PublicHttpsLookup; fetch?: PublicHttpsFetch },
): Promise<{ url: string; title: string; text: string }> {
  const lookup = deps?.lookup ?? defaultLookup;
  const fetchImpl = deps?.fetch ?? defaultFetch;
  let current = assertPublicHttpsUrl(raw);
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    await assertResolvedPublic(current.hostname, lookup);
    const response = await fetchImpl(current.toString(), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: "text/html, text/plain, application/xhtml+xml",
        "User-Agent": "Coolto-Desktop/1.0",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next || hop === MAX_HOPS) throw new Error("岗位链接重定向无效");
      current = assertPublicHttpsUrl(new URL(next, current).toString());
      continue;
    }
    if (!response.ok) throw new Error("无法读取该岗位链接");
    const type = response.headers.get("content-type") ?? "text/html";
    if (!/text\/html|text\/plain|application\/xhtml\+xml/iu.test(type)) {
      throw new Error("该链接不是可读的岗位页面");
    }
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > PUBLIC_HTTPS_MAX_BYTES) {
      throw new Error("岗位页面过大，无法抓取");
    }
    const body = await readLimited(response);
    const text = htmlToVisibleText(body);
    if (text.length < 10) throw new Error("岗位页面没有足够的可读正文");
    return { url: current.toString(), title: titleOf(body, current), text };
  }
  throw new Error("岗位链接重定向过多");
}

async function assertResolvedPublic(
  hostname: string,
  lookup: PublicHttpsLookup,
): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateOrLocalIp(host)) throw new Error("不能抓取内网或本机地址");
    return;
  }
  let records: Array<{ address: string }>;
  try {
    records = await lookup(host);
  } catch {
    throw new Error("无法解析该岗位链接");
  }
  if (!records.length || records.some((row) => isPrivateOrLocalIp(row.address))) {
    throw new Error("不能抓取内网或本机地址");
  }
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, PUBLIC_HTTPS_MAX_BYTES);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > PUBLIC_HTTPS_MAX_BYTES) throw new Error("岗位页面过大，无法抓取");
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function titleOf(html: string, url: URL): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu);
  const title = match?.[1] ? htmlToVisibleText(match[1], 160) : "";
  return title || url.hostname;
}

async function defaultLookup(hostname: string): Promise<Array<{ address: string }>> {
  return dnsLookup(hostname, { all: true });
}

function defaultFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}
