import assert from "node:assert/strict";
import test from "node:test";

import {
  profileContactChanges,
  profileContactFields,
  profileChanges,
  profileDraft,
  profileFormErrors,
} from "../src/desktop/renderer/src/profile/profile-form.js";
import {
  profileCareerStageLabel,
  profileDefaultLabel,
} from "../src/profile/profile-defaults.js";

const complete = {
  fullName: "Alice Chen", phone: "+852 1234 5678", contactEmail: "alice@example.test",
  location: "Hong Kong", linkedinUrl: "https://www.linkedin.com/in/alice",
  githubUrl: "https://github.com/alice", personalWebsite: "https://alice.example.test",
  currentTitle: "", currentCompany: "", yearsOfExperience: "", careerStage: "",
  preferredLanguage: "zh-CN", resumeStyle: "standard", careerTargets: [],
};

test("Profile form requires resume contact fields and validates contact URL formats", () => {
  assert.deepEqual(
    profileFormErrors({ ...complete, fullName: " ", contactEmail: "not-an-email" }),
    { fullName: "此项为必填项", contactEmail: "简历联系邮箱格式无效" },
  );
  assert.deepEqual(
    profileFormErrors({ ...complete, contactEmail: "alice@invalid" }),
    { contactEmail: "简历联系邮箱格式无效" },
  );
  assert.deepEqual(
    profileFormErrors({ ...complete, githubUrl: "http://github.com/alice" }),
    { githubUrl: "网址必须是完整 https:// URL" },
  );
});

test("Profile form keeps blank optional fields null and emits only changed fields", () => {
  const before = profileDraft({ ...profile(), location: "Hong Kong" });
  const after = { ...before, location: " ", phone: "+852 8765 4321" };
  assert.deepEqual(profileContactFields(after).location, null);
  assert.deepEqual(profileContactChanges(before, after), {
    phone: "+852 8765 4321", location: null,
  });
});

test("Profile keeps unknown legacy defaults readable without treating them as new writes", () => {
  assert.equal(profileCareerStageLabel("legacy_stage"), "未识别");
  assert.equal(profileDefaultLabel("language", "legacy-locale"), "未识别");
  assert.equal(profileDefaultLabel("resumeStyle", "legacy-style"), "未识别");
  assert.equal(profileCareerStageLabel("early_career"), "early_career");
});

test("Profile legacy arrays become one stable compatibility target and edits allocate opaque identity", () => {
  const { careerTargets: _targets, ...legacyProfileBase } = profile();
  const legacyProfile = {
    ...legacyProfileBase,
    targetRoles: ["工程师", "产品经理"], targetIndustries: ["互联网"], targetLocations: ["香港"],
  };
  const first = profileDraft(legacyProfile);
  const second = profileDraft(legacyProfile);
  assert.equal(first.careerTargets.length, 1);
  assert.equal(first.careerTargets[0]?.idKind, "legacy_compatibility");
  assert.equal(first.careerTargets[0]?.role, "产品经理");
  const edited = {
    ...first,
    careerTargets: [{ ...first.careerTargets[0]!, role: "高级产品经理" }],
  };
  const changes = profileChanges(first, edited);
  assert.equal(changes.careerTargets?.[0]?.idKind, "opaque");
  assert.notEqual(changes.careerTargets?.[0]?.id, first.careerTargets[0]?.id);
});

function profile() {
  return {
    ...complete, email: "sign-in@example.test", currentTitle: null, currentCompany: null,
    yearsOfExperience: null, careerStage: null, targetRoles: [], targetIndustries: [],
    targetLocations: [], careerTargets: [], preferredLanguage: "zh-CN", resumeStyle: null,
  };
}
