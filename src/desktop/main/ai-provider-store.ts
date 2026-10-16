import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { app, safeStorage } from "electron";

import {
  normalizeAiProviderConfig,
  readAiProviderFromEnv,
  toAiProviderPublicView,
  type AiProviderConfig,
  type AiProviderPublicView,
} from "../../ai-provider-config.js";
import { setAiProviderOverride } from "../../ai-provider-runtime.js";

export class ElectronAiProviderStore {
  readonly #path: string;

  public constructor(userData = app.getPath("userData")) {
    this.#path = join(userData, "ai-provider", "config.coolto");
  }

  public async load(): Promise<AiProviderConfig> {
    const stored = await this.#read();
    const config = normalizeAiProviderConfig(stored ?? {}, readAiProviderFromEnv());
    setAiProviderOverride(config);
    return config;
  }

  public async save(input: Partial<AiProviderConfig>): Promise<AiProviderPublicView> {
    const current = await this.load();
    const next = normalizeAiProviderConfig({
      baseUrl: input.baseUrl,
      modelId: input.modelId,
      apiKey: input.apiKey?.trim() ? input.apiKey : current.apiKey,
    });
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("系统安全存储不可用，拒绝保存 API Key");
    }
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    await writeFile(
      temporary,
      safeStorage.encryptString(JSON.stringify(next)),
      { mode: 0o600 },
    );
    await rename(temporary, this.#path);
    setAiProviderOverride(next);
    return toAiProviderPublicView(next);
  }

  public async publicView(): Promise<AiProviderPublicView> {
    return toAiProviderPublicView(await this.load());
  }

  async #read(): Promise<Partial<AiProviderConfig> | undefined> {
    try {
      const raw = safeStorage.decryptString(await readFile(this.#path));
      return JSON.parse(raw) as Partial<AiProviderConfig>;
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error
        && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      return undefined;
    }
  }
}
