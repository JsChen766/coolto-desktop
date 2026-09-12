import type { PreferenceDesktopView, ProfileContactView } from "@desktop/types";
import type { PreferenceMutationInputV1 } from "../../../../preference/types.js";

const STORAGE_KEY = "coolto-phase2-ui-qa-v1";

export type QaPersistedState = {
  profile: ProfileContactView;
  preferences: PreferenceDesktopView[];
  rejectedSuggestions: string[];
};

function defaultProfile(): ProfileContactView {
  const now = "2026-09-11T00:00:00.000Z";
  return {
    fullName: "QA 用户", phone: "+852 9123 4567", contactEmail: "qa@example.test",
    location: "香港", linkedinUrl: null, githubUrl: null, personalWebsite: null, email: null,
    currentTitle: "工程师", currentCompany: "Coolto", yearsOfExperience: 3,
    careerStage: "mid_career", careerTargets: [], targetRoles: [], targetIndustries: [],
    targetLocations: [], preferredLanguage: "zh-CN", resumeStyle: "standard",
    entityVersion: 1, updatedAt: now, syncStatus: "clean",
  };
}

export function loadQaState(): QaPersistedState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { profile: defaultProfile(), preferences: [], rejectedSuggestions: [] };
    return JSON.parse(raw) as QaPersistedState;
  } catch {
    return { profile: defaultProfile(), preferences: [], rejectedSuggestions: [] };
  }
}

export function saveQaState(state: QaPersistedState): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function preferenceView(input: PreferenceMutationInputV1, id: string): PreferenceDesktopView {
  const now = new Date().toISOString();
  return {
    version: 1, id, ownerId: "00000000-0000-4000-8000-000000000001", entityVersion: 1,
    key: input.key, value: input.value, scope: input.scope, priority: input.priority ?? 50,
    conflictGroup: input.key, source: input.source ?? "explicit_user",
    sourceSuggestionHash: input.sourceSuggestionHash ?? null, status: "active",
    ruleVersion: `${input.key}-v1`, confirmedAt: now, createdAt: now, updatedAt: now,
    deletedAt: null, contentHash: "0".repeat(64), expiresAt: null,
    syncStatus: "pending", localUsage: { useCount: 0, lastUsedAt: null },
  };
}
