import type {
  DeliveryResumeFile,
  DeliveryResumeSlot,
} from "./types.js";

export const DELIVERY_RESUME_SLOTS: readonly DeliveryResumeSlot[] = [1, 2, 3];

export interface DeliveryResumeManifest {
  schemaVersion: "delivery-resume-files-v2";
  ownerId: string;
  files: DeliveryResumeFile[];
}

export function emptyDeliveryResumeManifest(
  ownerId: string,
): DeliveryResumeManifest {
  return { schemaVersion: "delivery-resume-files-v2", ownerId, files: [] };
}

export function normalizeDeliveryResumeManifest(
  value: unknown,
): DeliveryResumeManifest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const manifest = value as {
    schemaVersion?: unknown;
    ownerId?: unknown;
    files?: unknown;
  };
  if (!["delivery-resume-files-v1", "delivery-resume-files-v2"]
    .includes(String(manifest.schemaVersion)) ||
    typeof manifest.ownerId !== "string" || !Array.isArray(manifest.files) ||
    !manifest.files.every(isDeliveryResumeFile)) return undefined;
  const files = manifest.files.map((file) => ({
    ...(file as DeliveryResumeFile & { slot?: DeliveryResumeSlot | null }),
  }));
  if (manifest.schemaVersion === "delivery-resume-files-v1") {
    assignLegacySlots(files);
  } else if (!hasValidSlots(files)) {
    return undefined;
  }
  return {
    schemaVersion: "delivery-resume-files-v2",
    ownerId: manifest.ownerId,
    files,
  };
}

function isDeliveryResumeFile(
  value: unknown,
): value is DeliveryResumeFile & { slot?: DeliveryResumeSlot | null } {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<DeliveryResumeFile>;
  return typeof file.id === "string" && typeof file.title === "string" &&
    typeof file.originalFilename === "string" &&
    (file.type === "pdf" || file.type === "docx") &&
    typeof file.mimeType === "string" && typeof file.sizeBytes === "number" &&
    typeof file.sha256 === "string" && typeof file.preferred === "boolean" &&
    typeof file.createdAt === "string" && typeof file.updatedAt === "string" &&
    (file.slot === undefined || file.slot === null || isSlot(file.slot));
}

function assignLegacySlots(
  files: Array<DeliveryResumeFile & { slot?: DeliveryResumeSlot | null }>,
): void {
  const ordered = [...files].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  ordered.forEach((file, index) => { file.slot = DELIVERY_RESUME_SLOTS[index] ?? null; });
}

function hasValidSlots(files: readonly DeliveryResumeFile[]): boolean {
  const slots = files.flatMap((file) => file.slot === null ? [] : [file.slot]);
  return slots.every(isSlot) && new Set(slots).size === slots.length;
}

function isSlot(value: unknown): value is DeliveryResumeSlot {
  return value === 1 || value === 2 || value === 3;
}
