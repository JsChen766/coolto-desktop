import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app, safeStorage } from "electron";

import type { AgentHarnessStateV1 } from "../../../agent-task/agent-harness-state.js";
import type { AgentHarnessStatePersistence } from "../../../agent-task/agent-harness-state-repository.js";
import { normalizeAgentHarnessStateV1 } from "../../../agent-task/normalize-agent-harness-state.js";
import { renameAgentFile } from "./atomic-agent-file.js";

export class ElectronAgentHarnessPersistence
implements AgentHarnessStatePersistence {
  readonly #directory: string;
  readonly #path: string;

  public constructor(private readonly ownerId: string) {
    const ownerHash = createHash("sha256").update(ownerId).digest("hex").slice(0, 20);
    this.#directory = join(app.getPath("userData"), "agent-harness", ownerHash);
    this.#path = join(this.#directory, "state.coolto");
  }

  public async load(): Promise<AgentHarnessStateV1 | undefined> {
    try {
      ensureEncryption();
      const serialized = safeStorage.decryptString(await readFile(this.#path));
      return normalizeAgentHarnessStateV1(JSON.parse(serialized) as unknown);
    } catch (error: unknown) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  public async save(state: AgentHarnessStateV1): Promise<void> {
    if (state.ownerId !== this.ownerId) throw new Error("Agent Harness owner 不匹配");
    ensureEncryption();
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    const encrypted = safeStorage.encryptString(JSON.stringify(state));
    await writeFile(temporary, encrypted, { mode: 0o600 });
    await renameAgentFile(temporary, this.#path);
  }

  public async clear(): Promise<void> {
    await rm(this.#directory, { recursive: true, force: true });
  }
}

function ensureEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，拒绝保存 Agent Harness 状态");
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" &&
    "code" in error && (error as { code?: string }).code === "ENOENT");
}
