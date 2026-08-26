export interface LoginCredentials {
  email: string;
  password: string;
  device?: DeviceInput;
}

export interface DeviceInput {
  id: string;
  name: string;
  platform: "macos" | "windows" | "linux";
  appVersion: string;
}

export interface LoginUser {
  userId: string;
  email: string;
}

export interface EmailChallengeInput {
	challengeId: string;
	email: string;
	purpose: "login";
	device: DeviceInput;
}

export interface EmailChallengeAccepted {
	challengeId: string;
	expiresAt: string;
	retryAfterSeconds: number;
}

export interface EmailVerifyInput {
	challengeId: string;
	code: string;
	device: DeviceInput;
}

export interface EmailLoginResult {
	user: CurrentUser;
}

export interface CurrentUser {
  id: string;
  email: string;
  status?: "active" | "suspended" | "pending_deletion" | "deleted";
  deviceId?: string;
}

export interface CurrentUserReader {
  getCurrentUser(signal?: AbortSignal): Promise<CurrentUser>;
}

export interface UserProfile {
  fullName: string | null;
  contactEmail: string | null;
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

export const JD_REQUIREMENT_V2_CATEGORIES = [
  "qualification",
  "responsibility",
  "technology",
  "domain",
  "soft_skill",
] as const;

export type JdRequirementV2Category =
  (typeof JD_REQUIREMENT_V2_CATEGORIES)[number];

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
  sourceKind: import("../jd/source.js").JdSourceKind;
  sourceUrl: string | null;
  rawText: string;
  requirements: JdRequirement[];
  jdHash: string | null;
  requirementMapId: string | null;
  requirementsOrigin: string;
  sourceThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  entityVersion: number;
  deletedAt: string | null;
  syncStatus?: "clean" | "pending" | "conflict" | "failed";
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
  sourceKind?: import("../jd/source.js").JdSourceKind;
  sourceUrl?: string | null;
  requirements?: Array<{
    text: string;
    category: string;
    importance: JdRequirementImportance;
    keywords: string[];
    v2Importance?: JdRequirementV2Importance;
    v2Category?: JdRequirementV2Category;
  }>;
  idempotencyKey?: string;
}

export interface JdWriter {
  createJd(input: JdCreateInput, signal?: AbortSignal): Promise<JdRecord>;
}
export type * from "./experience-types.js";

export interface AppConfigView {
  /** Context compaction threshold in tokens; undefined when unset. */
  contextCompactThresholdTokens?: number;
}
