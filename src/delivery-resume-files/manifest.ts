import type { DeliveryResumeFile } from "./types.js";

export interface DeliveryResumeManifest {
  schemaVersion: "delivery-resume-files-v1";
  ownerId: string;
  files: DeliveryResumeFile[];
}

export function emptyDeliveryResumeManifest(
  ownerId: string,
): DeliveryResumeManifest {
  return { schemaVersion: "delivery-resume-files-v1", ownerId, files: [] };
}

export function isDeliveryResumeManifest(
  value: unknown,
): value is DeliveryResumeManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<DeliveryResumeManifest>;
  return manifest.schemaVersion === "delivery-resume-files-v1" &&
    typeof manifest.ownerId === "string" && Array.isArray(manifest.files) &&
    manifest.files.every(isDeliveryResumeFile);
}

function isDeliveryResumeFile(value: unknown): value is DeliveryResumeFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<DeliveryResumeFile>;
  return typeof file.id === "string" && typeof file.title === "string" &&
    typeof file.originalFilename === "string" &&
    (file.type === "pdf" || file.type === "docx") &&
    typeof file.mimeType === "string" && typeof file.sizeBytes === "number" &&
    typeof file.sha256 === "string" && typeof file.preferred === "boolean" &&
    typeof file.createdAt === "string" && typeof file.updatedAt === "string";
}
