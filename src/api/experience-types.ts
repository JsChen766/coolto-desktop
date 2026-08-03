export type ExperienceCategory =
  | "work"
  | "project"
  | "education"
  | "volunteer"
  | "other";

export interface ExperienceRevision {
  id: string;
  experienceId: string;
  content: string;
  source: string;
  revisionHash: string | null;
  factBankStatus: string;
  createdAt: string;
}

export interface ExperienceSummary {
  id: string;
  category: ExperienceCategory;
  title: string;
  organization: string | null;
  role: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  tags: string[];
  resumeSectionKey?: string | null;
  resumeSectionLabel?: string | null;
  status: "active" | "archived";
  currentRevisionId: string | null;
  currentRevision?: ExperienceRevision;
  createdAt: string;
  updatedAt: string;
  entityVersion: number;
  deletedAt: string | null;
  syncStatus?: "clean" | "pending" | "conflict" | "failed";
}

export interface ExperienceDetail extends ExperienceSummary {
  revisions: ExperienceRevision[];
}

export interface ExperienceSearchResult {
  items: ExperienceSummary[];
  nextCursor: string | null;
}

export interface ExperienceRevisionPage {
  items: ExperienceRevision[];
  nextCursor: string | null;
}

export interface ExperienceSearchOptions {
  q?: string;
  category?: ExperienceCategory;
  tags?: string[];
  resumeSectionKey?: string;
  resumeSectionLabel?: string;
  status?: "active" | "archived";
  limit?: number;
  cursor?: string;
}

export interface ExperienceReader {
  searchExperiences(
    options?: ExperienceSearchOptions,
    signal?: AbortSignal,
  ): Promise<ExperienceSearchResult>;
  getExperience(
    experienceId: string,
    signal?: AbortSignal,
  ): Promise<ExperienceDetail>;
}

export interface ExperienceRevisionReader {
  listExperienceRevisions(
    experienceId: string,
    cursor?: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<ExperienceRevisionPage>;
}

export interface ExperienceCreateInput {
  category: ExperienceCategory;
  title: string;
  content: string;
  organization?: string;
  role?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  tags?: string[];
  resumeSectionKey?: string | null;
  resumeSectionLabel?: string | null;
  status?: "active" | "archived";
  idempotencyKey?: string;
}

export interface ExperienceUpdateInput {
  category?: ExperienceCategory;
  title?: string;
  content?: string;
  organization?: string | null;
  role?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  tags?: string[];
  resumeSectionKey?: string | null;
  resumeSectionLabel?: string | null;
  status?: "active" | "archived";
}

export interface ExperienceWriter {
  createExperience(
    input: ExperienceCreateInput,
    signal?: AbortSignal,
  ): Promise<ExperienceDetail>;
}

export interface ExperienceMaintenanceWriter {
  updateExperience(
    experienceId: string,
    input: ExperienceUpdateInput,
    signal?: AbortSignal,
  ): Promise<ExperienceDetail>;
  deleteExperience(
    experienceId: string,
    signal?: AbortSignal,
  ): Promise<ExperienceDetail>;
}
