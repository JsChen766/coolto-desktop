export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginUser {
  userId: string;
  email: string;
}

export interface CurrentUser {
  id: string;
  email: string;
}

export interface CurrentUserReader {
  getCurrentUser(signal?: AbortSignal): Promise<CurrentUser>;
}

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
  status: "active" | "archived";
  currentRevisionId: string | null;
  currentRevision?: ExperienceRevision;
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceDetail extends ExperienceSummary {
  revisions: ExperienceRevision[];
}

export interface ExperienceSearchResult {
  items: ExperienceSummary[];
  nextCursor: string | null;
}

export interface ExperienceSearchOptions {
  q?: string;
  category?: ExperienceCategory;
  tags?: string[];
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
