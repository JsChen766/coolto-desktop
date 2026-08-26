import { rename } from "node:fs/promises";

const RENAME_RETRY_DELAYS_MS = [50, 200, 500] as const;

/** Retries transient Windows locks while preserving atomic replacement. */
export async function renameConversationFileWithRetry(
  source: string,
  destination: string,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error: unknown) {
      if (attempt >= RENAME_RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, RENAME_RETRY_DELAYS_MS[attempt]),
      );
    }
  }
}
