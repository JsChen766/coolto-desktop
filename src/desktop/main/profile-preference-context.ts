import { resolvePreferences } from "../../preference/resolution.js";
import type { PreferenceReaderV1 } from "../../preference/types.js";
import { careerTargetFingerprint } from "../../profile/career-targets.js";
import type { UserProfile } from "../../api/types.js";
import type {
  ResumeProfilePreferenceContext,
} from "../../resume/workspace/profile-preference-binding.js";

interface ResumeProfileReader {
  getUserProfile(): Promise<Pick<UserProfile, "careerTargets" | "entityVersion">>;
  getProfileContext?: () => Promise<{
    profile: Pick<UserProfile, "careerTargets" | "entityVersion">;
    localVersion: number;
  }>;
}

export async function resolveResumeProfilePreferenceContext(
  ownerId: string,
  sessionId: string,
  profiles: ResumeProfileReader,
  preferences: PreferenceReaderV1,
): Promise<ResumeProfilePreferenceContext> {
  const profileContext = profiles.getProfileContext
    ? await profiles.getProfileContext()
    : undefined;
  const profile = profileContext?.profile ?? await profiles.getUserProfile();
  const primary = profile.careerTargets?.find((target) => target.isPrimary);
  const targetFingerprint = primary ? careerTargetFingerprint(primary) : null;
  const resolution = resolvePreferences({
    preferences: await preferences.listPreferences(),
    context: {
      ownerId, sessionId, turnId: "resume-context", actionId: "resume-context",
      taskScope: "resume", targetFingerprint, domain: null,
    },
    now: new Date().toISOString(),
  });
  return {
    profileEntityVersion: profile.entityVersion ?? 0,
    ...(profileContext ? { profileLocalVersion: profileContext.localVersion } : {}),
    preferenceResolutionHash: resolution.resolutionHash,
    targetFingerprint,
    explainability: {
      appliedKeys: resolution.applied.map((item) => item.key),
      overriddenCount: resolution.overridden.length,
      conflictCount: resolution.conflicts.length,
    },
    resolution,
  };
}
