/**
 * Electron skips Chromium's own download-name truncation once `setSavePath` is
 * called from `will-download`, so the app caps the name itself. 200 UTF-8 bytes
 * stays under the APFS 255-byte name limit and Windows MAX_PATH while leaving
 * room for a " (n)" collision suffix and a ".crdownload" temp suffix.
 */
const MAX_NAME_BYTES = 200;
const MAX_EXTENSION_BYTES = 16;
const FALLBACK_STEM = "download";
const RESERVED_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/gu;

export interface DownloadSaveNameParts {
  stem: string;
  extension: string;
}

/** Splits an untrusted download name into a filesystem-safe stem + extension. */
export function downloadSaveNameParts(untrusted: string): DownloadSaveNameParts {
  const segment = (untrusted.split(/[\\/]/u).at(-1) ?? "").toWellFormed();
  const sanitized = segment.replace(RESERVED_CHARACTERS, "_").trim();
  const { stem, extension } = splitExtension(sanitized);
  const budget = MAX_NAME_BYTES - utf8Bytes(extension);
  const safeStem = truncateUtf8(stem, budget).replace(/[.\s]+$/u, "");
  return { stem: safeStem || FALLBACK_STEM, extension };
}

function splitExtension(name: string): DownloadSaveNameParts {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, extension: "" };
  const extension = name.slice(dot);
  const usable = extension.length > 1 &&
    utf8Bytes(extension) <= MAX_EXTENSION_BYTES &&
    !/\s/u.test(extension);
  return usable
    ? { stem: name.slice(0, dot), extension }
    : { stem: name, extension: "" };
}

/** Cuts by whole code points so a surrogate pair is never split. */
function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8Bytes(value) <= maxBytes) return value;
  let used = 0;
  let kept = "";
  for (const codePoint of value) {
    used += utf8Bytes(codePoint);
    if (used > maxBytes) break;
    kept += codePoint;
  }
  return kept;
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
