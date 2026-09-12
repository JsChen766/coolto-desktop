import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUserProfile } from "../src/api/normalizers.js";
import { resolveResumeProfilePreferenceContext } from "../src/desktop/main/profile-preference-context.js";

import type { UserProfile } from "../src/api/types.js";
import { careerTargetFingerprint } from "../src/profile/career-targets.js";
import { mergeProfileLocalPayload } from "../src/desktop/main/profile/profile-local-sync-adapter.js";
import {
  toProfileLocalPayload,
  toProfileServerPushPayload,
  toProfileWritePayload,
  toUserProfile,
} from "../src/desktop/main/profile/profile-sync-mapping.js";

const target = {
  id: "00000000-0000-4000-8000-000000000001",
  idKind: "opaque" as const,
  role: "产品经理",
  industries: ["互联网"],
  locations: ["香港"],
  isPrimary: true,
};

const profile: UserProfile = {
  fullName: "测试用户", contactEmail: null, email: null, phone: "13800138000",
  location: "香港", linkedinUrl: null, githubUrl: null, personalWebsite: null,
  currentTitle: "产品经理", currentCompany: "Coolto", yearsOfExperience: 5,
  careerStage: "career_change", careerTargets: [target],
  targetRoles: ["产品经理"], targetIndustries: ["互联网"], targetLocations: ["香港"],
  preferredLanguage: "zh-CN", resumeStyle: "standard",
};

test("Profile server push payload matches Go sync strict schema", () => {
  const push = toProfileServerPushPayload(profile);
  assert.equal("careerTargets" in push, false);
  assert.equal("contactEmail" in push, false);
  assert.deepEqual(push.targetRoles, ["产品经理"]);
});

test("Profile remote payload omits local target identity and local projection preserves it", () => {
  const payload = toProfileWritePayload(profile);
  assert.equal(payload.contactEmail, null);
  assert.deepEqual(payload.careerTargets, [{
    role: "产品经理", industries: ["互联网"], locations: ["香港"], isPrimary: true,
  }]);
  assert.equal(JSON.stringify(payload).includes('"id"'), false);
  const local = toProfileLocalPayload(profile);
  assert.deepEqual(local.careerTargets, [{ ...target }]);
  const projected = toUserProfile({
    entityType: "user_profile", entityId: "owner-1", entityVersion: 2,
    localVersion: 1, syncStatus: "clean", operation: "upsert",
    changedAt: "2026-01-01T00:00:00.000Z", payload: local,
  });
  assert.equal(projected.careerTargets?.[0]?.idKind, "opaque");
  assert.equal(projected.careerTargets?.[0]?.id, target.id);
  assert.equal(
    careerTargetFingerprint(projected.careerTargets![0]!),
    careerTargetFingerprint(target),
  );
});

test("Profile local payload keeps opaque target identity while remote payload stays canonical", () => {
  const remote = toProfileWritePayload(profile);
  const local = toProfileLocalPayload(profile);
  assert.equal("id" in (remote.careerTargets as Array<Record<string, unknown>>)[0]!, false);
  assert.equal((local.careerTargets as Array<Record<string, unknown>>)[0]?.id, target.id);
  assert.equal((local.careerTargets as Array<Record<string, unknown>>)[0]?.idKind, "opaque");
});

test("legacy-only remote Profile payload remains a compatibility projection", () => {
  const payload = mergeProfileLocalPayload("user_profile", undefined, {
    targetRoles: ["产品经理"], targetIndustries: ["互联网"], targetLocations: ["香港"],
  });
  assert.equal("careerTargets" in payload, false);
  assert.deepEqual(payload.targetRoles, ["产品经理"]);
});
test("Profile remote payload omits unknown legacy defaults instead of rewriting them", () => {
  const payload = toProfileWritePayload({
    ...profile, careerStage: "legacy-stage", preferredLanguage: "legacy-locale", resumeStyle: "legacy-style",
  });
  assert.equal("careerStage" in payload, false);
  assert.equal("preferredLanguage" in payload, false);
  assert.equal("resumeStyle" in payload, false);
});

test("canonical-only local Profile projections derive legacy arrays", () => {
  const payload = toProfileWritePayload(profile);
  const { targetRoles: _roles, targetIndustries: _industries,
    targetLocations: _locations, ...canonicalOnly } = payload;
  const projected = toUserProfile({
    entityType: "user_profile", entityId: "owner-1", entityVersion: 1,
    localVersion: 1, syncStatus: "clean", operation: "upsert",
    changedAt: "2026-01-01T00:00:00.000Z", payload: canonicalOnly,
  });
  assert.deepEqual(projected.targetRoles, ["产品经理"]);
  assert.deepEqual(projected.targetLocations, ["香港"]);
});


test("Profile API normalization accepts backend targets without IDs", () => {
  const normalized = normalizeUserProfile({
    ...profile, email: "login@example.com", careerStage: "career_switcher",
    careerTargets: [{ role: "产品经理", industries: ["互联网"], locations: ["香港"], isPrimary: true }],
    entityVersion: 2, updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(normalized.careerStage, "career_change");
  assert.equal(normalized.careerTargets?.[0]?.idKind, "legacy_compatibility");
  assert.equal(normalized.entityVersion, 2);
});

test("Profile API normalization rejects disagreement between canonical and legacy targets", () => {
  assert.throws(() => normalizeUserProfile({
    ...profile,
    careerTargets: [{ role: "产品经理", industries: ["互联网"], locations: ["香港"], isPrimary: true }],
    targetRoles: ["工程师"],
  }), /不一致/u);
});
test("resume Profile Preference binding is deterministic across create and restore reads", async () => {
  const profileValue = {
    ...profile, entityVersion: 7, updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const profiles = {
    getUserProfile: async () => profileValue,
    getProfileContext: async () => ({ profile: profileValue, localVersion: 4 }),
  };
  const preferences = {
    listPreferences: async () => [],
    getPreference: async () => null,
  };
  const first = await resolveResumeProfilePreferenceContext("owner-1", "conversation-1", profiles, preferences);
  const second = await resolveResumeProfilePreferenceContext("owner-1", "conversation-1", profiles, preferences);
  assert.equal(first.preferenceResolutionHash, second.preferenceResolutionHash);
  assert.equal(first.profileLocalVersion, 4);
  assert.equal(first.targetFingerprint, second.targetFingerprint);
  assert.deepEqual(first.explainability, second.explainability);
});
