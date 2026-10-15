export interface CachedPrivacyConsent {
  policyVersion: string;
  contentHash: string;
  status: "accepted" | "declined" | "withdrawn";
  acceptedAt: string | null;
  decisionAt: string;
}

export interface StoredPrivacyFile {
  version: 1;
  apiBaseUrl: string;
  entries: Record<string, CachedPrivacyConsent>;
}

export function emptyStoredPrivacyFile(apiBaseUrl: string): StoredPrivacyFile {
  return { version: 1, apiBaseUrl, entries: {} };
}

export function parseStoredPrivacyFile(
  value: unknown,
  apiBaseUrl: string,
): StoredPrivacyFile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const file = value as Partial<StoredPrivacyFile>;
  if (file.version !== 1 || file.apiBaseUrl !== apiBaseUrl) return undefined;
  if (!file.entries || typeof file.entries !== "object") return undefined;
  if (!Object.values(file.entries).every(isCachedConsent)) return undefined;
  return file as StoredPrivacyFile;
}

function isCachedConsent(value: unknown): value is CachedPrivacyConsent {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CachedPrivacyConsent>;
  return typeof entry.policyVersion === "string" && typeof entry.contentHash === "string" &&
    ["accepted", "declined", "withdrawn"].includes(entry.status ?? "") &&
    (entry.acceptedAt === null || typeof entry.acceptedAt === "string") &&
    typeof entry.decisionAt === "string";
}
