import { rename } from "node:fs/promises";

const RETRY_DELAYS = [50, 200, 500] as const;

export async function renameAgentFile(
  source: string,
  destination: string,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const delay = RETRY_DELAYS[attempt];
      if (delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
