import assert from "node:assert/strict";
import test from "node:test";

import {
  profileContactChanges,
  profileContactFields,
  profileDraft,
  profileFormErrors,
} from "../src/desktop/renderer/src/profile/profile-form.js";

const complete = {
  fullName: "Alice Chen", phone: "+852 1234 5678", contactEmail: "alice@example.test",
  location: "Hong Kong", linkedinUrl: "https://www.linkedin.com/in/alice",
  githubUrl: "https://github.com/alice", personalWebsite: "https://alice.example.test",
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

function profile() {
  return {
    ...complete, email: "sign-in@example.test", currentTitle: null, currentCompany: null,
    yearsOfExperience: null, careerStage: null, targetRoles: [], targetIndustries: [],
    targetLocations: [], preferredLanguage: "zh-CN", resumeStyle: null,
  };
}
