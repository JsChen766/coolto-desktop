import type { JobSourceListing } from "../agent-task/browser-lead-types.js";

export type JobSourceFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface JobSourceResult {
  company: string;
  listings: JobSourceListing[];
}

export async function readJson(
  response: Response,
  source: string,
): Promise<unknown> {
  if (!response.ok) throw new Error(`${source} 返回 HTTP ${response.status}`);
  return response.json();
}

export function assertSourceKey(value: string, label: string): string {
  const key = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/u.test(key)) {
    throw new Error(`${label} 必须是 ATS URL 中的公开 site/token`);
  }
  return key;
}

export function plainText(value: unknown): string {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}
