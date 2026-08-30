import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { app, safeStorage } from "electron";

import {
  ONBOARDING_VERSION,
  type OnboardingStatus,
} from "../../shared/types.js";
import type { OnboardingStateRepository } from "./onboarding-service.js";

const STEPS = new Set<OnboardingStatus["step"]>([
  "welcome", "experience", "resume", "browser", "browser_review",
  "tracker", "complete", "completed",
]);

export class ElectronOnboardingStateRepository
implements OnboardingStateRepository {
  readonly #path: string;

  public constructor(ownerId: string) {
    const ownerHash = createHash("sha256").update(ownerId).digest("hex").slice(0, 20);
    this.#path = join(app.getPath("userData"), "onboarding", `${ownerHash}.coolto`);
  }

  public async read(): Promise<OnboardingStatus | undefined> {
    try {
      const encrypted = await readFile(this.#path);
      const parsed = JSON.parse(this.#decrypt(encrypted)) as unknown;
      return isStatus(parsed) ? parsed : undefined;
    } catch (error: unknown) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  public async write(status: OnboardingStatus): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储不可用，无法保存首次体验状态");
    }
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    const encrypted = safeStorage.encryptString(JSON.stringify(status));
    await writeFile(temporary, encrypted, { mode: 0o600 });
    await rename(temporary, this.#path);
  }

  #decrypt(value: Buffer): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储不可用，无法读取首次体验状态");
    }
    return safeStorage.decryptString(value);
  }
}

function isStatus(value: unknown): value is OnboardingStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OnboardingStatus>;
  return candidate.version === ONBOARDING_VERSION
    && ["not_started", "in_progress", "completed"].includes(String(candidate.state))
    && STEPS.has(candidate.step as OnboardingStatus["step"])
    && (candidate.conversationId === null || typeof candidate.conversationId === "string")
    && (candidate.completedAt === null || typeof candidate.completedAt === "string");
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT";
}
