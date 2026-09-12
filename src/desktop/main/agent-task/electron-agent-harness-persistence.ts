import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app, safeStorage } from "electron";

import type { AgentHarnessStateV1 } from "../../../agent-task/agent-harness-state.js";
import type { AgentHarnessStatePersistence } from "../../../agent-task/agent-harness-state-repository.js";
import { normalizeAgentHarnessStateV1 } from "../../../agent-task/normalize-agent-harness-state.js";
import {
  localScopeDigest,
  localScopeKey,
  requireScopedEnvelope,
} from "../../../privacy/local-scope.js";
import { renameAgentFile } from "./atomic-agent-file.js";

export class ElectronAgentHarnessPersistence implements AgentHarnessStatePersistence {
  readonly #directory: string;
  readonly #path: string;
  public constructor(
    private readonly apiBaseUrl: string,
    private readonly ownerId: string,
  ) {
    this.#directory = join(app.getPath("userData"), "agent-harness", localScopeKey(apiBaseUrl, ownerId));
    this.#path = join(this.#directory, "state.coolto");
  }

  public async load(): Promise<AgentHarnessStateV1 | undefined> {
    try {
      ensureEncryption();
      const parsed = JSON.parse(safeStorage.decryptString(await readFile(this.#path))) as unknown;
      const state = requireScopedEnvelope<AgentHarnessStateV1>(parsed, this.apiBaseUrl, this.ownerId);
      return normalizeAgentHarnessStateV1(state);
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
    const encrypted = safeStorage.encryptString(JSON.stringify({
      scopeDigest: localScopeDigest(this.apiBaseUrl, this.ownerId),
      ownerId: this.ownerId,
      value: state,
    }));
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
  return Boolean(error && typeof error === "object" && "code" in error &&
    (error as { code?: string }).code === "ENOENT");
}
