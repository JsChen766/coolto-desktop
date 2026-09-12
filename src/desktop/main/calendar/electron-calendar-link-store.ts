import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { app, safeStorage } from "electron";
import {
  localScopeDigest,
  localScopeKey,
  requireScopedEnvelope,
} from "../../../privacy/local-scope.js";
import type {
  CalendarLink,
  CalendarLinkRepository,
} from "../../../calendar/calendar-types.js";

interface StoredLinks {
  version: 1;
  links: CalendarLink[];
}

export class ElectronCalendarLinkStore implements CalendarLinkRepository {
  readonly #directory: string;
  readonly #path: string;
  readonly #links = new Map<string, CalendarLink>();
  #loaded = false;
  #writeChain: Promise<void> = Promise.resolve();
  public constructor(
    private readonly apiBaseUrl: string,
    private readonly ownerId: string,
  ) {
    this.#directory = join(app.getPath("userData"), "calendar-links", localScopeKey(apiBaseUrl, ownerId));
    this.#path = join(this.#directory, "links.coolto");
  }

  public async get(interviewId: string): Promise<CalendarLink | null> {
    await this.#load();
    await this.#writeChain;
    const link = this.#links.get(requireId(interviewId, "interviewId"));
    return link ? structuredClone(link) : null;
  }

  public async upsert(link: CalendarLink): Promise<void> {
    await this.#load();
    const value = normalizeLink(link);
    await this.#write(() => {
      this.#links.set(value.interviewId, value);
      return this.#save();
    });
  }

  public async remove(interviewId: string): Promise<void> {
    await this.#load();
    const id = requireId(interviewId, "interviewId");
    await this.#write(async () => {
      if (!this.#links.delete(id)) return;
      await this.#save();
    });
  }

  public async clearAll(): Promise<void> {
    await this.#load();
    await this.#write(async () => {
      this.#links.clear();
      await rm(this.#directory, { recursive: true, force: true });
    });
  }

  async #load(): Promise<void> {
    if (this.#loaded) return;
    requireEncryption();
    let encrypted: Buffer;
    try { encrypted = await readFile(this.#path); } catch (error: unknown) {
      if (isMissing(error)) {
        this.#loaded = true;
        return;
      }
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(safeStorage.decryptString(encrypted));
    } catch {
      throw new Error("本地 Calendar 映射已损坏");
    }
    const stored = normalizeStored(requireScopedEnvelope<StoredLinks>(
      parsed, this.apiBaseUrl, this.ownerId,
    ));
    for (const link of stored.links) this.#links.set(link.interviewId, link);
    this.#loaded = true;
  }

  async #save(): Promise<void> {
    requireEncryption();
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const payload: StoredLinks = {
      version: 1,
      links: [...this.#links.values()].sort((a, b) =>
        a.interviewId.localeCompare(b.interviewId)),
    };
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, safeStorage.encryptString(JSON.stringify({
        scopeDigest: localScopeDigest(this.apiBaseUrl, this.ownerId),
        ownerId: this.ownerId,
        value: payload,
      })), { mode: 0o600 });
      await rename(temporary, this.#path);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  #write(action: () => Promise<void>): Promise<void> {
    const next = this.#writeChain.then(action);
    this.#writeChain = next.catch(() => undefined);
    return next;
  }
}

function normalizeStored(value: unknown): StoredLinks {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("本地 Calendar 映射格式无效");
  }
  const stored = value as Partial<StoredLinks>;
  if (stored.version !== 1 || !Array.isArray(stored.links)) {
    throw new Error("本地 Calendar 映射版本无效");
  }
  return { version: 1, links: stored.links.map(normalizeLink) };
}

function normalizeLink(value: CalendarLink): CalendarLink {
  const eventFingerprint = value.eventFingerprint?.trim();
  if (!/^[a-f0-9]{64}$/u.test(eventFingerprint)) throw new Error("Calendar fingerprint 无效");
  const createdAt = date(value.createdAt, "Calendar createdAt");
  const updatedAt = date(value.updatedAt, "Calendar updatedAt");
  return {
    applicationId: requireId(value.applicationId, "applicationId"),
    interviewId: requireId(value.interviewId, "interviewId"),
    eventIdentifier: requireId(value.eventIdentifier, "eventIdentifier"),
    calendarIdentifier: value.calendarIdentifier?.trim() || null,
    eventFingerprint, createdAt, updatedAt,
  };
}

function requireId(value: string, label: string): string {
  const id = value?.trim();
  if (!id || id.length > 240) throw new Error(`${label} 无效`);
  return id;
}

function date(value: string, label: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} 无效`);
  return value;
}

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("系统安全存储不可用，拒绝保存 Calendar 映射");
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
