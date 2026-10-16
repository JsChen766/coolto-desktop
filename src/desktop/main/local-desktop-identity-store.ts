import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createUuidV7 } from "../../sync/uuid-v7.js";

export interface LocalDesktopIdentity {
  userId: string;
  deviceId: string;
}

export class LocalDesktopIdentityStore {
  public constructor(private readonly path: string) {}

  public async loadOrCreate(): Promise<LocalDesktopIdentity> {
    const existing = await this.#read();
    if (existing) return existing;
    const created: LocalDesktopIdentity = {
      userId: createUuidV7(),
      deviceId: createUuidV7(),
    };
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await writeFile(this.path, JSON.stringify(created), { mode: 0o600 });
    return created;
  }

  async #read(): Promise<LocalDesktopIdentity | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as {
        userId?: unknown;
        deviceId?: unknown;
      };
      if (typeof parsed.userId === "string" && parsed.userId
        && typeof parsed.deviceId === "string" && parsed.deviceId) {
        return { userId: parsed.userId, deviceId: parsed.deviceId };
      }
      return undefined;
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error
        && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }
}

export function localDesktopIdentityPath(userData: string): string {
  return join(userData, "local-desktop", "identity.json");
}
