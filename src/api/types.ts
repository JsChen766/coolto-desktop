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

export interface UserProfile {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  personalWebsite: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  yearsOfExperience: number | null;
  careerStage: string | null;
  targetRoles: string[];
  targetIndustries: string[];
  targetLocations: string[];
  preferredLanguage: string | null;
  resumeStyle: string | null;
}

export interface UserProfileReader {
  getUserProfile(signal?: AbortSignal): Promise<UserProfile>;
}

export type JdRequirementImportance = "low" | "medium" | "high";
export type JdRequirementV2Importance =
  | "must_have"
  | "preferred"
  | "optional";

export interface JdRequirement {
  id: string;
  text: string;
  category: string;
  importance: JdRequirementImportance;
  keywords: string[];
  weight: number | null;
  v2Importance: JdRequirementV2Importance | null;
  v2Category: string | null;
}

export interface JdRecord {
  id: string;
  title: string;
  company: string | null;
  targetRole: string | null;
  rawText: string;
  requirements: JdRequirement[];
  jdHash: string | null;
  requirementMapId: string | null;
  requirementsOrigin: string;
  sourceThreadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JdSearchResult {
  items: JdRecord[];
  nextCursor: string | null;
}

export interface JdSearchOptions {
  limit?: number;
  cursor?: string;
}

export interface JdReader {
  listJds(
    options?: JdSearchOptions,
    signal?: AbortSignal,
  ): Promise<JdSearchResult>;
  getJd(jdId: string, signal?: AbortSignal): Promise<JdRecord>;
}

export interface JdCreateInput {
  title: string;
  rawText: string;
  company?: string;
  targetRole?: string;
  requirements?: Array<{
    text: string;
    category: string;
    importance: JdRequirementImportance;
    keywords: string[];
    v2Importance?: JdRequirementV2Importance;
    v2Category?: string;
  }>;
}

export interface JdWriter {
  createJd(input: JdCreateInput, signal?: AbortSignal): Promise<JdRecord>;
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
}

export interface ExperienceWriter {
  createExperience(
    input: ExperienceCreateInput,
    signal?: AbortSignal,
  ): Promise<ExperienceDetail>;
}
