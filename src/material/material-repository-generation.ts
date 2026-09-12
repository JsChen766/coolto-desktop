import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import type { MaterialCatalogEntry, MaterialStoredRecord } from "./material-repository.js";
import { readMaterialEncrypted, writeMaterialEncrypted } from "./material-repository-crypto.js";
import { normalizeMaterialRecord, toMaterialCatalogEntry } from "./material-repository-helpers.js";
import { materialOwnerRootLockPath, withMaterialRootLock } from "./material-root-lock.js";
import { isMaterialDataProperty, isMaterialRecord, isSafeOpaqueId } from "./material-types.js";

interface CommitMarker { schema: "material.repository.commit"; version: 1; generation: string; previousGeneration: string | null; }
const COMMIT_KEYS = ["schema", "version", "generation", "previousGeneration"] as const;

/** COW generations are published only by a marker; a root lock serializes every reader, writer, and cleanup. */
export class MaterialGenerationStore {
  #generation: string | undefined;
  #catalog = new Map<string, MaterialCatalogEntry>();
  readonly #lock: string;

  public constructor(private readonly root: string, private readonly key: Buffer, private readonly ownerId: string, private readonly aad: (value: string) => string) {
    this.#lock = materialOwnerRootLockPath(root);
  }
  public async load(): Promise<void> { await this.#withRootLock(() => this.#load()); }
  public async list(): Promise<MaterialCatalogEntry[]> { return this.#read(() => [...this.#catalog.values()].map(toMaterialCatalogEntry)); }
  public async get(materialId: string): Promise<MaterialStoredRecord | undefined> { return this.#read(() => {
    const entry = this.#catalog.get(materialId.trim());
    return entry ? this.#readRecord(entry) : undefined;
  }); }
  public async records(): Promise<Map<string, MaterialStoredRecord>> { return this.#read(() => this.#records()); }
  public async transaction<T>(operation: (records: Map<string, MaterialStoredRecord>) => T | Promise<T>): Promise<T> {
    return this.#withRootLock(async () => {
      await this.#load();
      const records = await this.#records();
      const result = await operation(records);
      await this.#commit(records);
      return result;
    });
  }
  public async clear(): Promise<void> {
    await this.#withRootLock(async () => { this.#catalog.clear(); this.#generation = undefined; await rm(this.root, { recursive: true, force: true }); });
  }

  async #read<T>(operation: () => T | Promise<T>): Promise<T> {
    return this.#withRootLock(async () => { await this.#load(); return operation(); });
  }
  async #load(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    this.#generation = undefined;
    this.#catalog.clear();
    let marker: CommitMarker | undefined;
    try { marker = await this.#readCommit(); }
    catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.#migrateLegacy();
      try { await this.#readCommit(); await this.#cleanupInactive(); await this.#cleanupLegacy(); }
      catch (afterMigration: unknown) {
        if ((afterMigration as NodeJS.ErrnoException).code !== "ENOENT") throw afterMigration;
        await this.#cleanupUncommitted();
      }
      return;
    }
    try { await this.#activate(marker); }
    catch (error) {
      if (!marker.previousGeneration) throw error;
      await this.#activate({ ...marker, generation: marker.previousGeneration, previousGeneration: null });
      await writeMaterialEncrypted(join(this.root, "commit.enc"), {
        schema: "material.repository.commit", version: 1, generation: marker.previousGeneration, previousGeneration: null,
      } satisfies CommitMarker, this.key, this.aad("commit"));
    }
    await this.#cleanupInactive();
    await this.#cleanupLegacy();
    this.#recoverProcessing();
  }
  async #records(): Promise<Map<string, MaterialStoredRecord>> {
    const records = new Map<string, MaterialStoredRecord>();
    for (const entry of this.#catalog.values()) records.set(entry.asset.identity.materialId, await this.#readRecord(entry));
    return records;
  }
  async #commit(records: ReadonlyMap<string, MaterialStoredRecord>): Promise<void> {
    const generation = `gen-${randomUUID()}`;
    const staging = join(this.root, "staging", generation);
    const destination = join(this.root, "generations", generation);
    const catalog = new Map<string, MaterialCatalogEntry>();
    try {
      for (const record of records.values()) {
        const normalized = normalizeMaterialRecord(record);
        await this.#writeRecord(staging, normalized);
        catalog.set(normalized.asset.identity.materialId, toMaterialCatalogEntry(normalized));
      }
      await writeMaterialEncrypted(join(staging, "catalog.enc"), [...catalog.values()], this.key, this.aad("catalog"));
      await mkdir(join(this.root, "generations"), { recursive: true });
      await rename(staging, destination);
      await writeMaterialEncrypted(join(this.root, "commit.enc"), {
        schema: "material.repository.commit", version: 1, generation, previousGeneration: this.#generation ?? null,
      } satisfies CommitMarker, this.key, this.aad("commit"));
      this.#generation = generation;
      this.#catalog = catalog;
      await this.#cleanupInactive();
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }
  async #activate(marker: CommitMarker): Promise<void> { this.#catalog = await this.#readCatalog(marker.generation); this.#generation = marker.generation; }
  async #readCommit(): Promise<CommitMarker> {
    const value = await readMaterialEncrypted(join(this.root, "commit.enc"), this.key, this.aad("commit"));
    if (!isMaterialRecord(value) || !strictKeys(value, COMMIT_KEYS) || value.schema !== "material.repository.commit" || value.version !== 1
      || !isSafeOpaqueId(value.generation) || (value.previousGeneration !== null && !isSafeOpaqueId(value.previousGeneration))) throw new Error("Material repository commit marker is malformed");
    return { schema: value.schema, version: value.version, generation: value.generation, previousGeneration: value.previousGeneration };
  }
  async #readCatalog(generation: string): Promise<Map<string, MaterialCatalogEntry>> {
    const root = join(this.root, "generations", generation);
    const value = await readMaterialEncrypted(join(root, "catalog.enc"), this.key, this.aad("catalog"));
    if (!Array.isArray(value)) throw new Error("Material catalog is malformed");
    const catalog = new Map<string, MaterialCatalogEntry>();
    for (const entry of value) {
      const normalized = toMaterialCatalogEntry(entry as MaterialCatalogEntry);
      const id = normalized.asset.identity.materialId;
      if (normalized.asset.identity.ownerId !== this.ownerId || catalog.has(id) || !await regular(join(root, "records", `${id}.enc`)) || !await regular(join(root, "raw", `${id}.bin`))) throw new Error("Material generation is incomplete");
      catalog.set(id, normalized);
    }
    return catalog;
  }
  async #readRecord(entry: MaterialCatalogEntry): Promise<MaterialStoredRecord> {
    if (!this.#generation) throw new Error("Material repository has no active generation");
    const root = join(this.root, "generations", this.#generation);
    const id = entry.asset.identity.materialId;
    const body = await readMaterialEncrypted(join(root, "records", `${id}.enc`), this.key, this.aad(id));
    const bytes = await readMaterialEncrypted(join(root, "raw", `${id}.bin`), this.key, this.aad(`${id}:raw`), true);
    if (!isMaterialRecord(body) || !(bytes instanceof Uint8Array)) throw new Error("Material repository record is malformed");
    return normalizeMaterialRecord({ ...body as Omit<MaterialStoredRecord, "bytes">, asset: entry.asset, bytes, lifecycleStatus: entry.lifecycleStatus, classification: entry.classification, lastError: entry.lastError });
  }
  async #writeRecord(root: string, record: MaterialStoredRecord): Promise<void> {
    const { bytes, ...body } = record;
    const id = record.asset.identity.materialId;
    await writeMaterialEncrypted(join(root, "records", `${id}.enc`), body, this.key, this.aad(id));
    await writeMaterialEncrypted(join(root, "raw", `${id}.bin`), bytes, this.key, this.aad(`${id}:raw`));
  }
  async #migrateLegacy(): Promise<void> {
    let value: unknown;
    try { value = await readMaterialEncrypted(join(this.root, "catalog.enc"), this.key, this.aad("catalog")); }
    catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    if (!Array.isArray(value)) throw new Error("Material catalog is malformed");
    const records = new Map<string, MaterialStoredRecord>();
    for (const item of value) try {
      const entry = toMaterialCatalogEntry(item as MaterialCatalogEntry);
      if (entry.asset.identity.ownerId !== this.ownerId) continue;
      const id = entry.asset.identity.materialId;
      const body = await readMaterialEncrypted(join(this.root, "records", `${id}.enc`), this.key, this.aad(id));
      const bytes = await readMaterialEncrypted(join(this.root, "raw", `${id}.bin`), this.key, this.aad(`${id}:raw`), true);
      if (isMaterialRecord(body) && bytes instanceof Uint8Array && legacyMatches(body, entry)) records.set(id, normalizeMaterialRecord({ ...body as Omit<MaterialStoredRecord, "bytes">, asset: entry.asset, bytes, lifecycleStatus: entry.lifecycleStatus, classification: entry.classification, lastError: entry.lastError }));
    } catch { continue; }
    await this.#commit(records);
    await this.#cleanupLegacy();
  }
  async #cleanupInactive(): Promise<void> {
    await removeChildren(join(this.root, "staging"), () => true);
    const keep = new Set<string>([this.#generation ?? ""]);
    try { const marker = await this.#readCommit(); if (marker.previousGeneration) keep.add(marker.previousGeneration); } catch { return; }
    await removeChildren(join(this.root, "generations"), (name) => !keep.has(name));
  }
  async #cleanupUncommitted(): Promise<void> { await removeChildren(join(this.root, "staging"), () => true); await removeChildren(join(this.root, "generations"), () => true); }
  async #cleanupLegacy(): Promise<void> { await Promise.all([rm(join(this.root, "catalog.enc"), { force: true }), rm(join(this.root, "records"), { recursive: true, force: true }), rm(join(this.root, "raw"), { recursive: true, force: true })]); }
  #recoverProcessing(): void {
    this.#catalog = new Map([...this.#catalog.entries()].map(([id, entry]) => entry.lifecycleStatus === "processing"
      ? [id, { ...entry, lifecycleStatus: "queued", lastError: "OCR interrupted; queued for retry", asset: { ...entry.asset, processing: { status: "unprocessed", ocr: entry.asset.processing.ocr } } }]
      : [id, entry]));
  }
  async #withRootLock<T>(operation: () => Promise<T>): Promise<T> {
    return withMaterialRootLock(this.#lock, operation);
  }
}

function strictKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { return keys.every((key) => Object.hasOwn(value, key) && isMaterialDataProperty(value, key)) && Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key) && isMaterialDataProperty(value, key)); }
function legacyMatches(body: Record<string, unknown>, entry: MaterialCatalogEntry): boolean { return body.lifecycleStatus === entry.lifecycleStatus && (body.classification ?? "unclassified") === entry.classification && body.lastError === entry.lastError && JSON.stringify(body.relations) === JSON.stringify(entry.relations); }
async function regular(path: string): Promise<boolean> { try { return (await stat(path)).isFile(); } catch { return false; } }
async function removeChildren(path: string, shouldRemove: (name: string) => boolean): Promise<void> { let entries; try { entries = await readdir(path, { withFileTypes: true }); } catch { return; } for (const entry of entries) if (entry.isDirectory() && shouldRemove(entry.name)) await rm(join(path, entry.name), { recursive: true, force: true }); }
