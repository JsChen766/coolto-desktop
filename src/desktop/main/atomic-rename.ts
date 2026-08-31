import { rename } from "node:fs/promises";

const RETRY_DELAYS_MS = [50, 200, 500] as const;

/** Retries transient Windows AV/file-lock failures during atomic replacement. */
export async function renameWithRetry(
  source: string,
  destination: string,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error: unknown) {
      if (attempt >= RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAYS_MS[attempt]),
      );
    }
  }
}
