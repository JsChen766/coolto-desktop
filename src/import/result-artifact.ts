export interface ExperienceImportSavedItem {
  clientId: string;
  experienceId: string;
  title: string;
}

export interface ExperienceImportFailure {
  clientId: string;
  title: string;
  message: string;
}

export interface ExperienceImportResultDetails {
  proposalId: string;
  sourceLabel: string | null;
  saved: ExperienceImportSavedItem[];
  failed: ExperienceImportFailure[];
  skippedDuplicateCount: number;
  completedAt: string;
}

export interface ExperienceImportResultArtifact {
  proposalId: string;
  sourceLabel: string | null;
  saved: ExperienceImportSavedItem[];
  failedCount: number;
  skippedDuplicateCount: number;
  createdAt: string;
  updatedAt: string;
  anchorMessageId?: string;
}

export function parseExperienceImportResult(
  value: unknown,
): ExperienceImportResultDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.proposalId !== "string"
    || !record.proposalId.startsWith("import-")
    || !Array.isArray(record.saved)
    || !Array.isArray(record.failed)
    || typeof record.skippedDuplicateCount !== "number"
    || typeof record.completedAt !== "string"
  ) return undefined;
  const saved = record.saved.map(parseSaved);
  const failed = record.failed.map(parseFailure);
  if (saved.some((item) => !item) || failed.some((item) => !item)) {
    return undefined;
  }
  return {
    proposalId: record.proposalId,
    sourceLabel: typeof record.sourceLabel === "string" ? record.sourceLabel : null,
    saved: saved as ExperienceImportSavedItem[],
    failed: failed as ExperienceImportFailure[],
    skippedDuplicateCount: Math.max(0, Math.floor(record.skippedDuplicateCount)),
    completedAt: record.completedAt,
  };
}

export function mergeExperienceImportResult(
  current: ExperienceImportResultArtifact | undefined,
  result: ExperienceImportResultDetails,
): ExperienceImportResultArtifact {
  const saved = new Map<string, ExperienceImportSavedItem>();
  for (const item of current?.saved ?? []) saved.set(item.clientId, item);
  for (const item of result.saved) saved.set(item.clientId, item);
  return {
    proposalId: result.proposalId,
    sourceLabel: result.sourceLabel ?? current?.sourceLabel ?? null,
    saved: [...saved.values()],
    failedCount: result.failed.length,
    skippedDuplicateCount: Math.max(
      current?.skippedDuplicateCount ?? 0,
      result.skippedDuplicateCount,
    ),
    createdAt: current?.createdAt ?? result.completedAt,
    updatedAt: result.completedAt,
    ...(current?.anchorMessageId
      ? { anchorMessageId: current.anchorMessageId }
      : {}),
  };
}

function parseSaved(value: unknown): ExperienceImportSavedItem | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  return typeof item.clientId === "string"
    && typeof item.experienceId === "string"
    && typeof item.title === "string"
    ? {
        clientId: item.clientId,
        experienceId: item.experienceId,
        title: item.title,
      }
    : undefined;
}

function parseFailure(value: unknown): ExperienceImportFailure | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  return typeof item.clientId === "string"
    && typeof item.title === "string"
    && typeof item.message === "string"
    ? { clientId: item.clientId, title: item.title, message: item.message }
    : undefined;
}
