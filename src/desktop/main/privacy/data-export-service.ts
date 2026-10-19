import { randomUUID } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import { basename, dirname } from "node:path";

import { PrivacyApi } from "../../../api/privacy-api.js";
import { buildExportPackage } from "../../../privacy/export-package.js";
import { canonicalExportJson } from "../../../privacy/export-canonical.js";
import type { ExportLocalPayload } from "../../../privacy/export-types.js";
import type { CloudExportSnapshotV1 } from "../../../privacy/types.js";
import type { PrivacyExportOptions, PrivacyExportResult } from "../../shared/types/privacy.js";
import { renameWithRetry } from "../atomic-rename.js";
import { recordLocalDiagnostic } from "../../../diagnostics/local-event-log.js";

export interface ExportLocalReadOptions {
  apiBaseUrl: string;
  ownerId: string;
  includeConversations: boolean;
  includeDrafts: boolean;
  includeTasks: boolean;
}

export interface ExportLocalReader {
  read(options?: ExportLocalReadOptions): Promise<{ payload: ExportLocalPayload; hasPending: boolean }>;
}

export interface ExportSaveDialog {
  choosePath(suggestedFilename: string): Promise<string | undefined>;
}


export interface DataExportScope {
  ownerId: string;
  apiBaseUrl: string;
  scopeDigest: string;
}

/** Optional OSS/local path: project sync-store business assets without cloud. */
export interface LocalBusinessSnapshotReader {
  read(scope: DataExportScope): Promise<CloudExportSnapshotV1 | null>;
}

export class DataExportService {
  public constructor(
    private readonly api: PrivacyApi,
    private readonly local: ExportLocalReader,
    private readonly saveDialog: ExportSaveDialog,
    private readonly getScope: () => DataExportScope,
    private readonly localBusiness: LocalBusinessSnapshotReader | null = null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async export(options: PrivacyExportOptions): Promise<PrivacyExportResult> {
    const scope = this.getScope();
    const local = await this.local.read({
      apiBaseUrl: scope.apiBaseUrl,
      ownerId: scope.ownerId,
      includeConversations: options.includeConversations,
      includeDrafts: options.includeDrafts,
      includeTasks: options.includeTasks,
    });
    if (!sameScope(scope, this.getScope())) throw new Error("账号来源切换期间拒绝导出");
    let snapshot = options.includeCloudAssets ? await this.api.exportSnapshot() : null;
    let snapshotEntriesLocalOnly = false;
    if (!snapshot && this.localBusiness) {
      snapshot = await this.localBusiness.read(scope);
      snapshotEntriesLocalOnly = snapshot !== null;
    }
    if (!sameScope(scope, this.getScope())) throw new Error("账号来源切换期间拒绝导出");
    const mode = options.includeCloudAssets && snapshot
      ? (local.hasPending ? "local_pending" : "synchronized")
      : "offline_stale";
    const envelope = await buildExportPackage({
      snapshot,
      accountScopeDigest: snapshot?.accountScopeDigest ?? scope.scopeDigest,
      local: local.payload,
      includeConversations: options.includeConversations,
      includeDrafts: options.includeDrafts,
      includeTasks: options.includeTasks,
      passphrase: options.passphrase,
      mode,
      createdAt: this.now().toISOString(),
      snapshotEntriesLocalOnly,
    });
    if (!sameScope(scope, this.getScope())) throw new Error("账号来源切换期间拒绝导出");
    const suggestedFilename = `coolto-export-v1-${filenameTimestamp(this.now())}.coolto-export.json`;
    const destination = await this.saveDialog.choosePath(suggestedFilename);
    if (!destination) {
      recordLocalDiagnostic({ action: "data_export", phase: "cancelled" });
      return { status: "cancelled", fileName: null, mode: null };
    }
    if (!sameScope(scope, this.getScope())) throw new Error("账号来源切换期间拒绝导出");
    try {
      await writeAtomic(destination, canonicalExportJson(envelope), () => sameScope(scope, this.getScope()));
    } catch {
      recordLocalDiagnostic({ action: "data_export", phase: "failure" });
      throw new Error("导出文件写入失败，请重试");
    }
    recordLocalDiagnostic({
      action: "data_export",
      phase: "success",
      detail: {
        mode,
        includeConversations: options.includeConversations,
        includeDrafts: options.includeDrafts,
        includeTasks: options.includeTasks,
        includeCloudAssets: options.includeCloudAssets,
      },
    });
    return { status: "exported", fileName: basename(destination), mode };
  }
}

function sameScope(left: DataExportScope, right: DataExportScope): boolean {
  return left.ownerId === right.ownerId &&
    left.apiBaseUrl === right.apiBaseUrl &&
    left.scopeDigest === right.scopeDigest;
}
async function writeAtomic(
  destination: string,
  content: string,
  isCurrentOwner: () => boolean = () => true,
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "w", 0o600);
  let failure: unknown;
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } catch (error: unknown) {
    failure = error;
  }
  try {
    await handle.close();
  } catch (error: unknown) {
    failure ??= error;
  }
  if (failure) {
    await unlink(temporary).catch(() => undefined);
    throw failure;
  }
  if (!isCurrentOwner()) {
    await unlink(temporary).catch(() => undefined);
    throw new Error("账号切换期间拒绝导出");
  }
  try {
    await renameWithRetry(temporary, destination);
  } catch (error: unknown) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function filenameTimestamp(value: Date): string {
  return value.toISOString().replace(/[.:]/gu, "-");
}
