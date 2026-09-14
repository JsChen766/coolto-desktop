import type { PreferenceResolutionV1 } from "../../preference/types.js";

export interface ResumeProfilePreferenceBinding {
  profileEntityVersion: number;
  /** Local projection revision; absent on legacy persisted workspaces. */
  profileLocalVersion?: number;
  preferenceResolutionHash: string;
  targetFingerprint: string | null;
  explainability: {
    appliedKeys: string[];
    overriddenCount: number;
    conflictCount: number;
  };
}

export interface ResumeProfilePreferenceContext extends ResumeProfilePreferenceBinding {
  resolution: PreferenceResolutionV1;
}
