import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

export interface UpdateFileInfo {
  url: string;
  sha512?: string;
  size?: number;
}

export interface DownloadProgress {
  received: number;
  total: number | null;
  percent: number;
}

export interface DownloadUpdateInput {
  files: readonly UpdateFileInfo[];
  feedUrl: string;
  targetPath: string;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
}

export async function downloadUpdateFile(
  input: DownloadUpdateInput,
): Promise<{ bytes: number; sha512: string }> {
  const file = selectZipFile(input.files);
  const url = resolveUpdateUrl(file.url, input.feedUrl);
  const expectedSha512 = file.sha512 ? trimSha512(file.sha512) : null;
  await mkdir(dirname(input.targetPath), { recursive: true });
  const response = await fetch(url, { signal: input.signal ?? null });
  if (!response.ok) {
    throw new Error(`下载失败：HTTP ${response.status}`);
  }
  const body = response.body;
  if (!body) throw new Error("下载失败：响应没有内容");
  const total =
    file.size ?? contentLength(response.headers) ?? null;
  const hash = createHash("sha512");
  const writer = createWriteStream(input.targetPath);
  let received = 0;
  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      writer.write(value);
      received += value.byteLength;
      if (total && input.onProgress) {
        input.onProgress({
          received,
          total,
          percent: (received / total) * 100,
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      writer.end((error?: Error | null) => (error ? reject(error) : resolve()));
    });
  } catch (error) {
    writer.destroy();
    await rm(input.targetPath, { force: true });
    throw error;
  }
  const actual = hash.digest("base64");
  if (expectedSha512 && actual !== expectedSha512) {
    await rm(input.targetPath, { force: true });
    throw new Error("更新包校验失败：SHA-512 不匹配");
  }
  return { bytes: received, sha512: actual };
}

export function selectZipFile(files: readonly UpdateFileInfo[]): UpdateFileInfo {
  const zip = files.find((file) => file.url.toLowerCase().endsWith(".zip"));
  if (!zip) {
    throw new Error("更新源中没有可用的 zip 更新包");
  }
  return zip;
}

export function resolveUpdateUrl(fileUrl: string, feedUrl: string): string {
  try {
    const base = feedUrl.endsWith("/") ? feedUrl : `${feedUrl}/`;
    return new URL(fileUrl, base).toString();
  } catch {
    throw new Error(`更新源 URL 无效：${fileUrl}`);
  }
}

function trimSha512(value: string): string {
  const marker = "sha512=";
  return value.startsWith(marker) ? value.slice(marker.length) : value;
}

function contentLength(headers: Headers): number | null {
  const raw = headers.get("content-length");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
