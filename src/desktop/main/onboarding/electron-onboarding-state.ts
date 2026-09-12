import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app, safeStorage } from "electron";

import { localScopeDigest, localScopeKey, legacyOwnerKey, requireScopedEnvelope } from "../../../privacy/local-scope.js";
import {
  ONBOARDING_VERSION,
  type OnboardingStatus,
} from "../../shared/types.js";
import type { OnboardingStateRepository } from "./onboarding-service.js";

const STEPS = new Set<OnboardingStatus["step"]>([
  "welcome", "experience", "resume", "browser", "browser_review",
  "tracker", "complete", "completed",
]);

export class ElectronOnboardingStateRepository implements OnboardingStateRepository {
  readonly #path: string;
  readonly #legacyPath: string;
  readonly #apiBaseUrl: string;
  readonly #ownerId: string;

  public constructor(apiBaseUrl: string, ownerId: string) {
    this.#apiBaseUrl = apiBaseUrl;
    this.#ownerId = ownerId;
    this.#path = join(app.getPath("userData"), "onboarding", `${localScopeKey(apiBaseUrl, ownerId)}.coolto`);
    this.#legacyPath = join(app.getPath("userData"), "onboarding", `${legacyOwnerKey(ownerId)}.coolto`);
  }

  public async read(): Promise<OnboardingStatus | undefined> {
    await this.#assertLegacyAbsent();
    try {
      const encrypted = await readFile(this.#path);
      const parsed = requireScopedEnvelope<OnboardingStatus>(
        JSON.parse(this.#decrypt(encrypted)), this.#apiBaseUrl, this.#ownerId,
      );
      return isStatus(parsed) ? parsed : undefined;
    } catch (error: unknown) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  public async write(status: OnboardingStatus): Promise<void> {
    await this.#assertLegacyAbsent();
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储不可用，无法保存首次体验状态");
    }
    await mkdir(join(app.getPath("userData"), "onboarding"), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    const encrypted = safeStorage.encryptString(JSON.stringify({
      scopeDigest: localScopeDigest(this.#apiBaseUrl, this.#ownerId),
      ownerId: this.#ownerId,
      value: status,
    }));
    await writeFile(temporary, encrypted, { mode: 0o600 });
    await rename(temporary, this.#path);
  }

  public async clear(): Promise<void> {
    await unlink(this.#path).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  async #assertLegacyAbsent(): Promise<void> {
    try { await stat(this.#legacyPath); } catch (error: unknown) {
      if (isMissing(error)) return;
      throw error;
    }
    throw new Error("检测到未绑定 API 来源的旧首次体验状态，已拒绝读取或覆盖");
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
  return candidate.version === ONBOARDING_VERSION &&
    ["not_started", "in_progress", "completed"].includes(String(candidate.state)) &&
    STEPS.has(candidate.step as OnboardingStatus["step"]) &&
    (candidate.conversationId === null || typeof candidate.conversationId === "string") &&
    (candidate.completedAt === null || typeof candidate.completedAt === "string");
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT";
}
