export const PREFERENCE_KEYS = [
  "resume.tone",
  "resume.bullet_style",
  "resume.avoid_terms",
  "job_search.location_priority",
  "job_search.work_mode",
] as const;
export type PreferenceKeyV1 = typeof PREFERENCE_KEYS[number];

export const PREFERENCE_SCOPE_KINDS = [
  "global", "resume", "job_search", "browser_fill", "interview",
] as const;
export type PreferenceScopeKind = typeof PREFERENCE_SCOPE_KINDS[number];

export type PreferenceSource = "explicit_user" | "behavior_confirmed";
export type PreferenceStatus = "active" | "disabled";
export type PreferenceValueV1 = string | string[];

export const PREFERENCE_SUGGESTION_RATIONALE_CODES = [
  "repeated_edit_pattern", "repeated_selection_pattern", "repeated_rejection_pattern",
] as const;
export type PreferenceSuggestionRationaleCodeV1 = typeof PREFERENCE_SUGGESTION_RATIONALE_CODES[number];
export interface PreferenceSuggestionRationaleV1 {
  code: PreferenceSuggestionRationaleCodeV1;
  referenceHashes: string[];
}
export interface PreferenceBehaviorBindingV1 {
  ownerId: string;
  sessionId: string;
  turnId: string;
  actionId: string;
  eventIds: string[];
}

export interface PreferenceEvidenceReferenceV1 {
  referenceHash: string;
  ownerId: string;
  sessionId: string;
  turnId: string;
  actionId: string;
  eventId: string;
  expiresAt: string;
}

export interface PreferenceEvidenceReferenceResolverV1 {
  resolve(referenceHash: string): PreferenceEvidenceReferenceV1 | null;
}

export interface PreferenceScopeV1 {
  kind: PreferenceScopeKind;
  domain?: string;
  targetFingerprint?: string;
}

export interface PreferenceV1 {
  version: 1;
  id: string;
  ownerId: string;
  entityVersion: number;
  key: PreferenceKeyV1;
  value: PreferenceValueV1;
  scope: PreferenceScopeV1;
  priority: number;
  conflictGroup: string;
  source: PreferenceSource;
  sourceSuggestionHash: string | null;
  status: PreferenceStatus;
  ruleVersion: string;
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  contentHash: string;
  expiresAt?: string | null;
}

export type PreferenceMutationAction = "create" | "update" | "disable" | "delete";

export interface PreferenceProposalInputV1 {
  action: PreferenceMutationAction;
  ownerId: string;
  preferenceId: string | null;
  expectedEntityVersion: number | null;
  preference: PreferenceV1 | null;
}

export interface PreferenceSuggestionV1 extends PreferenceBehaviorBindingV1 {
  version: 1;
  id: string;
  patternHash: string;
  key: PreferenceKeyV1;
  proposedValue: PreferenceValueV1;
  scope: PreferenceScopeV1;
  conflictGroup: string;
  observationCount: number;
  observationActionCount: number;
  observationWindow: { from: string; to: string };
  confidence: "possible" | "strong";
  rationale: PreferenceSuggestionRationaleV1;
  state: "pending" | "accepted" | "rejected" | "expired";
  acceptedAt?: string | null;
  acceptedPreferenceId?: string | null;
  createdAt: string;
  lastPresentedAt: string | null;
  expiresAt: string;
  ruleVersion?: string;
}

export interface PreferenceSuggestionSuppressionV1 extends PreferenceBehaviorBindingV1 {
  version: 1;
  patternHash: string;
  patternAuthorityHash: string;
  referenceHashes: string[];
  key: PreferenceKeyV1;
  scope: PreferenceScopeV1;
  ruleVersion: string;
  suppressedAt: string;
  expiresAt: string;
}

export interface PreferenceResolutionContextV1 {
  ownerId: string;
  sessionId: string;
  turnId: string;
  actionId: string;
  taskScope: PreferenceScopeKind;
  targetFingerprint: string | null;
  domain: string | null;
}

export interface PreferenceTurnOverrideV1 {
  key: PreferenceKeyV1;
  value: PreferenceValueV1;
  scope?: PreferenceScopeV1;
  reason?: string;
}

export interface PreferenceResolutionInputV1 {
  preferences: readonly PreferenceV1[];
  context: PreferenceResolutionContextV1;
  currentOverride?: PreferenceTurnOverrideV1 | null;
  currentOverrides?: readonly PreferenceTurnOverrideV1[];
  suggestions?: readonly PreferenceSuggestionV1[];
  evidenceResolver?: PreferenceEvidenceReferenceResolverV1;
  now: string | number;
}

export interface PreferenceResolutionApplied {
  preferenceId: string;
  key: PreferenceKeyV1;
  value: PreferenceValueV1;
  valueHash: string;
  scope: PreferenceScopeV1;
  reason: string;
}

export interface PreferenceResolutionOverridden {
  preferenceId: string;
  key: PreferenceKeyV1;
  reason: string;
}

export interface PreferenceResolutionConflict {
  key: PreferenceKeyV1;
  conflictGroup: string;
  preferenceIds: string[];
  reason: string;
}

export interface PreferenceResolutionIgnored {
  preferenceId: string;
  reason: string;
}

export interface PreferenceExplainabilitySnapshotV1 {
  version: 1;
  contextFingerprint: string;
  applied: Array<Pick<PreferenceResolutionApplied, "preferenceId" | "key" | "valueHash" | "reason">>;
  overridden: PreferenceResolutionOverridden[];
  conflicts: PreferenceResolutionConflict[];
  ignored: PreferenceResolutionIgnored[];
}

export interface PreferenceResolutionV1 {
  context: PreferenceResolutionContextV1;
  contextFingerprint: string;
  resolutionHash: string;
  applied: PreferenceResolutionApplied[];
  overridden: PreferenceResolutionOverridden[];
  conflicts: PreferenceResolutionConflict[];
  ignored: PreferenceResolutionIgnored[];
  explainabilitySnapshot: PreferenceExplainabilitySnapshotV1;
}
export interface PreferenceMutationInputV1 {
  key: PreferenceKeyV1;
  value: PreferenceValueV1;
  scope: PreferenceScopeV1;
  priority: number;
  source?: PreferenceSource;
  sourceSuggestionHash?: string | null;
}

export interface PreferenceListFilterV1 {
  kind?: PreferenceScopeKind;
  domain?: string;
  targetFingerprint?: string;
  includeDisabled?: boolean;
}

export interface PreferenceReaderV1 {
  listPreferences(filter?: PreferenceListFilterV1): Promise<PreferenceV1[]>;
  getPreference(id: string): Promise<PreferenceV1 | null>;
}

export interface PreferenceUsageViewV1 {
  preferenceId: string;
  useCount: number;
  lastUsedAt: string | null;
}

export type PreferenceProposalActionV1 =
  | PreferenceMutationAction
  | "accept_server"
  | "reapply";

export interface PreferenceWriteProposalV1 {
  id: string;
  action: PreferenceProposalActionV1;
  ownerId: string;
  preferenceId: string | null;
  current: PreferenceV1 | null;
  next: PreferenceV1 | null;
  expectedEntityVersion: number | null;
  localVersion: number;
  preparedAt: string;
  explanation: string;
}
export interface PreferenceUsageRecordV1 extends PreferenceUsageViewV1 {
  ownerId: string;
}
