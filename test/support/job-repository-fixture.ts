import type { JdRecord } from "../../src/api/types.js";
import type { ResumeLibraryEntry } from "../../src/resume/library/types.js";
import type { ApplicationRecord, ApplicationStatus } from "../../src/tracker/types.js";

const AT = "2026-07-28T08:00:00.000Z";

export function repositoryJd(
  id: string,
  title = `JD ${id}`,
  deletedAt: string | null = null,
): JdRecord {
  return {
    id,
    title,
    company: `Company ${id}`,
    targetRole: `Role ${id}`,
    rawText: `Raw ${id}`,
    requirements: [],
    jdHash: null,
    requirementMapId: null,
    requirementsOrigin: "app_extracted",
    sourceThreadId: null,
    createdAt: AT,
    updatedAt: AT,
    entityVersion: 1,
    deletedAt,
    syncStatus: "clean",
  };
}

export function repositoryResume(
  id: string,
  jdId: string | null,
  options: {
    status?: "active" | "archived";
    syncStatus?: ResumeLibraryEntry["syncStatus"];
  } = {},
): ResumeLibraryEntry {
  return {
    entryId: `cloud:${id}`,
    displayTitle: `Resume ${id}`,
    cloud: {
      resumeId: id,
      title: `Resume ${id}`,
      targetRole: "Engineer",
      jdId,
      status: options.status ?? "active",
      contentHash: `hash-${id}`,
      updatedAt: AT,
    },
    local: null,
    syncStatus: options.syncStatus ?? "cloud_only",
    availableOperations: ["open"],
  };
}

export function localRepositoryResume(id: string): ResumeLibraryEntry {
  return {
    entryId: `local:${id}`,
    displayTitle: `Local ${id}`,
    cloud: null,
    local: {
      artifactId: id,
      title: `Local ${id}`,
      updatedAt: AT,
      checkpointCount: 1,
      hasPendingChange: false,
      generationStrategy: "tailored",
      generationReady: false,
    },
    syncStatus: "local_only",
    availableOperations: ["open"],
  };
}

export function repositoryApplication(
  id: string,
  jdId: string | null,
  resumeId: string | null,
  status: ApplicationStatus = "applied",
  snapshots: { jd?: string; resume?: string } = {},
): ApplicationRecord {
  return {
    id,
    jdId,
    resumeId,
    companyName: "Coolto",
    roleName: "Engineer",
    jdTitleSnapshot: snapshots.jd ?? "Frozen JD",
    resumeTitleSnapshot: snapshots.resume ?? "Frozen Resume",
    resumeContentHashSnapshot: "a".repeat(64),
    deliveryMethod: "manual",
    targetUrl: null,
    appliedAt: AT,
    status,
    pendingConfirmation: false,
    source: "manual",
    dedupeKey: null,
    companyBusiness: null,
    roleSummary: null,
    companyCulture: null,
    rejectionReason: null,
    entityVersion: 1,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    syncStatus: "clean",
  };
}
