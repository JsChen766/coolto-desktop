import type { JdRequirement } from "../api/types.js";
import type { ResumeLibraryEntry } from "../resume/library/types.js";
import type {
  ApplicationStatus,
  TrackerSyncStatus,
} from "../tracker/types.js";
import type {
  ApplicationSummary,
  AssetReferenceState,
} from "./types.js";

export interface JobRepositoryReference {
  id: string | null;
  title: string;
  state: AssetReferenceState;
}

export interface JobRepositoryApplication {
  id: string;
  jdId: string | null;
  resumeId: string | null;
  companyName: string;
  roleName: string;
  jdTitleSnapshot: string | null;
  resumeTitleSnapshot: string | null;
  status: ApplicationStatus;
  appliedAt: string | null;
  createdAt: string;
  syncStatus: TrackerSyncStatus;
}

export interface JobRepositoryJd {
  id: string;
  title: string;
  company: string | null;
  targetRole: string | null;
  rawText: string;
  requirements: readonly JdRequirement[];
  syncStatus: TrackerSyncStatus;
  updatedAt: string;
  targetedResumeIds: readonly string[];
  otherUsedResumes: readonly JobRepositoryReference[];
  applicationSummary: ApplicationSummary;
  applications: readonly JobRepositoryApplication[];
}

export type JobRepositoryResumeKind =
  | "targeted"
  | "generic"
  | "local_only"
  | "missing_jd";

export interface JobRepositoryResume {
  entry: ResumeLibraryEntry;
  resumeId: string | null;
  artifactId: string | null;
  kind: JobRepositoryResumeKind;
  primaryJd: JobRepositoryReference;
  appliedJds: readonly JobRepositoryReference[];
  applicationSummary: ApplicationSummary;
  applications: readonly JobRepositoryApplication[];
}

export interface JobRepositorySnapshot {
  jds: readonly JobRepositoryJd[];
  resumes: readonly JobRepositoryResume[];
}
