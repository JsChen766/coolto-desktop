import type { JdRecord } from "../api/types.js";
import type { Resume } from "../resume/types.js";
import type {
  ApplicationRecord,
  ApplicationStatus,
} from "../tracker/types.js";

export type JobAssetJd = Readonly<
  Pick<JdRecord, "id" | "title" | "company" | "targetRole" | "deletedAt">
>;

export type JobAssetResume = Readonly<
  Pick<Resume, "id" | "title" | "jdId" | "status" | "deletedAt">
>;

export type JobAssetApplication = Readonly<
  Pick<
    ApplicationRecord,
    | "id"
    | "jdId"
    | "resumeId"
    | "jdTitleSnapshot"
    | "resumeTitleSnapshot"
    | "status"
    | "appliedAt"
    | "createdAt"
    | "deletedAt"
  >
>;

export type ApplicationStatusCounts = Readonly<
  Record<ApplicationStatus, number>
>;

export interface LatestApplicationSummary {
  id: string;
  status: ApplicationStatus;
  occurredAt: string;
}

export interface ApplicationSummary {
  total: number;
  statusCounts: ApplicationStatusCounts;
  latest: LatestApplicationSummary | null;
}

export interface JobAssetResumeProjection {
  resume: JobAssetResume;
  applicationSummary: ApplicationSummary;
}

export interface JobAssetJdProjection {
  jd: JobAssetJd;
  resumes: readonly JobAssetResumeProjection[];
  resumeCount: number;
  applicationSummary: ApplicationSummary;
}

export type AssetReferenceState = "linked" | "empty" | "missing";

export interface ApplicationAssetReference {
  id: string | null;
  titleSnapshot: string | null;
  state: AssetReferenceState;
}

export interface JobAssetApplicationRelation {
  application: JobAssetApplication;
  jd: ApplicationAssetReference;
  resume: ApplicationAssetReference;
}

export interface JobAssetProjection {
  jds: readonly JobAssetJdProjection[];
  genericResumes: readonly JobAssetResumeProjection[];
  resumesWithMissingJd: readonly JobAssetResumeProjection[];
  applicationRelations: readonly JobAssetApplicationRelation[];
}

export interface JobAssetProjectionInput {
  jds: readonly JobAssetJd[];
  resumes: readonly JobAssetResume[];
  applications: readonly JobAssetApplication[];
}
