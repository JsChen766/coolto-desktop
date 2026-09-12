import type {
  ExportSnapshotMode,
  CloudExportSnapshotEntry,
  CloudExportRelationship,
} from "./types.js";

export interface ExportScope {
  cloudAssets: boolean;
  localConversations: boolean;
  localDrafts: boolean;
  localTasks: boolean;
  rawFiles: false;
}

export interface ExportSnapshotView {
  mode: ExportSnapshotMode;
  capturedAt: string;
  syncIssues: number;
}

export interface ExportManifestEntry {
  path: string;
  kind: string;
  bytes: number;
  sha256: string;
  protected: true;
  localOnly: boolean;
}

export interface ExportManifestBody {
  accountScopeDigest: string;
  entries: ExportManifestEntry[];
  relationshipCount: number;
  relationshipSha256: string;
  counts: Record<string, number>;
  excluded: Array<{ kind: string; reason: string }>;
}

export interface ExportEncryptionMetadata {
  kdf: "scrypt";
  kdfParams: { N: 32768; r: 8; p: 1; keyLength: 32; maxMemoryBytes: 67108864 };
  cipher: "aes-256-gcm";
  salt: string;
  nonce: string;
  tag: string;
  aadSha256: string;
}

export interface ExportEnvelopeV1 {
  format: "coolto-data-export";
  schemaVersion: 1;
  exportId: string;
  createdAt: string;
  scope: ExportScope;
  snapshot: ExportSnapshotView;
  manifest: { body: ExportManifestBody; rootSha256: string };
  encryption: ExportEncryptionMetadata;
  payload: string;
}

export interface ExportLocalPayload {
  conversations?: unknown[];
  drafts?: unknown[];
  tasks?: unknown[];
}

export interface ExportPayloadV1 {
  cloud: {
    entries: CloudExportSnapshotEntry[];
    relationships: CloudExportRelationship[];
  } | null;
  local: ExportLocalPayload;
}
