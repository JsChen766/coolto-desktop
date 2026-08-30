import type { JdRecord } from "../api/types.js";
import type { ResumeLibraryEntry } from "../resume/library/types.js";
import type { ApplicationRecord } from "../tracker/types.js";
import type { DeliveryResumeFile } from "../delivery-resume-files/types.js";
import { projectJobAssets } from "./projection.js";
import {
  jdReference,
  uniqueJdReferences,
  uniqueOtherResumeReferences,
} from "./repository-relations.js";
import type {
  JobRepositoryApplication,
  JobRepositoryJd,
  JobRepositoryResume,
  JobRepositoryResumeKind,
  JobRepositorySnapshot,
} from "./repository-types.js";
import type { ApplicationSummary } from "./types.js";

export interface JobRepositoryProjectionInput {
  jds: readonly JdRecord[];
  resumes: readonly ResumeLibraryEntry[];
  applications: readonly ApplicationRecord[];
  deliveryResumeFiles?: readonly DeliveryResumeFile[];
}

export function projectJobRepository(
  input: JobRepositoryProjectionInput,
): JobRepositorySnapshot {
  const jds = input.jds.filter((jd) => jd.deletedAt === null);
  const applications = input.applications.filter((item) => item.deletedAt === null);
  const cloudEntries = input.resumes.filter((entry) => entry.cloud !== null);
  const assets = projectJobAssets({
    jds,
    resumes: cloudEntries.map((entry) => ({
      id: entry.cloud!.resumeId,
      title: entry.cloud!.title,
      jdId: entry.cloud!.jdId,
      status: entry.cloud!.status,
      deletedAt: null,
    })),
    applications,
  });
  const jdById = new Map(jds.map((jd) => [jd.id, jd]));
  const resumeById = new Map(
    cloudEntries.map((entry) => [entry.cloud!.resumeId, entry]),
  );
  const resumeSummaryById = resumeSummaries(assets);
  const targetedEntryIds = groupTargetedEntryIds(input.resumes);

  return {
    jds: assets.jds.map((asset) => buildJd(
      asset.jd.id,
      jdById,
      resumeById,
      asset.resumes.map((resume) => resume.resume.id),
      targetedEntryIds.get(asset.jd.id) ?? [],
      asset.applicationSummary,
      applications,
    )),
    resumes: input.resumes.map((entry) => buildResume(
      entry,
      jdById,
      resumeSummaryById,
      applications,
    )),
    deliveryResumeFiles: [...(input.deliveryResumeFiles ?? [])]
      .sort((left, right) => Number(right.preferred) - Number(left.preferred) ||
        right.updatedAt.localeCompare(left.updatedAt)),
  };
}

function buildJd(
  id: string,
  jds: ReadonlyMap<string, JdRecord>,
  resumes: ReadonlyMap<string, ResumeLibraryEntry>,
  targetedResumeIds: readonly string[],
  targetedResumeEntryIds: readonly string[],
  applicationSummary: ApplicationSummary,
  allApplications: readonly ApplicationRecord[],
): JobRepositoryJd {
  const jd = required(jds.get(id), `JD ${id} is missing`);
  const applications = recentApplications(
    allApplications.filter((application) => application.jdId === id),
  );
  return {
    id,
    title: jd.title,
    company: jd.company,
    targetRole: jd.targetRole,
    rawText: jd.rawText,
    requirements: jd.requirements,
    syncStatus: jd.syncStatus ?? "clean",
    updatedAt: jd.updatedAt,
    targetedResumeIds,
    targetedResumeEntryIds,
    otherUsedResumes: uniqueOtherResumeReferences(
      applications,
      new Set(targetedResumeIds),
      resumes,
    ),
    applicationSummary,
    applications: applications.map(toApplicationView),
  };
}

function buildResume(
  entry: ResumeLibraryEntry,
  jds: ReadonlyMap<string, JdRecord>,
  summaries: ReadonlyMap<string, ApplicationSummary>,
  allApplications: readonly ApplicationRecord[],
): JobRepositoryResume {
  const resumeId = entry.cloud?.resumeId ?? null;
  const targetJdId = resumeTargetJdId(entry);
  const applications = resumeId
    ? recentApplications(allApplications.filter((item) => item.resumeId === resumeId))
    : [];
  return {
    entry,
    resumeId,
    artifactId: entry.local?.artifactId ?? null,
    kind: resumeKind(entry, targetJdId, jds),
    primaryJd: jdReference(targetJdId, entry.local?.jdTitle ?? null, jds),
    appliedJds: uniqueJdReferences(applications, jds),
    applicationSummary: resumeId
      ? required(summaries.get(resumeId), `Resume summary ${resumeId} is missing`)
      : emptySummary(),
    applications: applications.map(toApplicationView),
  };
}

function resumeSummaries(
  assets: ReturnType<typeof projectJobAssets>,
): Map<string, ApplicationSummary> {
  const projections = [
    ...assets.jds.flatMap((jd) => jd.resumes),
    ...assets.genericResumes,
    ...assets.resumesWithMissingJd,
  ];
  return new Map(projections.map((item) => [item.resume.id, item.applicationSummary]));
}

function resumeKind(
  entry: ResumeLibraryEntry,
  targetJdId: string | null,
  jds: ReadonlyMap<string, JdRecord>,
): JobRepositoryResumeKind {
  if (targetJdId) return jds.has(targetJdId) ? "targeted" : "missing_jd";
  if (entry.cloud || entry.local?.generationStrategy === "general") return "generic";
  return "local_only";
}

function resumeTargetJdId(entry: ResumeLibraryEntry): string | null {
  return entry.cloud?.jdId ?? entry.local?.jdId ?? null;
}

function groupTargetedEntryIds(
  resumes: readonly ResumeLibraryEntry[],
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const resume of resumes) {
    const jdId = resumeTargetJdId(resume);
    if (!jdId) continue;
    grouped.set(jdId, [...(grouped.get(jdId) ?? []), resume.entryId]);
  }
  return grouped;
}

function recentApplications(
  applications: readonly ApplicationRecord[],
): ApplicationRecord[] {
  return [...applications].sort((left, right) => {
    const leftAt = left.appliedAt ?? left.createdAt;
    const rightAt = right.appliedAt ?? right.createdAt;
    return leftAt === rightAt
      ? right.id.localeCompare(left.id)
      : rightAt.localeCompare(leftAt);
  });
}

function toApplicationView(value: ApplicationRecord): JobRepositoryApplication {
  return {
    id: value.id,
    jdId: value.jdId,
    resumeId: value.resumeId,
    companyName: value.companyName,
    roleName: value.roleName,
    jdTitleSnapshot: value.jdTitleSnapshot,
    resumeTitleSnapshot: value.resumeTitleSnapshot,
    status: value.status,
    appliedAt: value.appliedAt,
    createdAt: value.createdAt,
    syncStatus: value.syncStatus,
  };
}

function emptySummary(): ApplicationSummary {
  return {
    total: 0,
    statusCounts: {
      applied: 0, screening: 0, interviewing: 0,
      offer: 0, rejected: 0, no_response: 0,
    },
    latest: null,
  };
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}
