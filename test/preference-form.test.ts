import assert from "node:assert/strict";
import test from "node:test";

import {
  PREFERENCE_FORM_SCOPES,
  preferenceFormErrors,
  preferenceInput,
  preferenceScopesForKey,
} from "../src/desktop/renderer/src/preference/preference-form.js";

const base = {
  key: "resume.tone" as const, value: "restrained", scopeKind: "global" as const,
  targetFingerprint: "", domain: "", priority: "50",
};

test("Preference form covers every supported scope and validates scoped fields", () => {
  assert.deepEqual(PREFERENCE_FORM_SCOPES, ["global", "resume", "job_search", "browser_fill", "interview"]);
  assert.deepEqual(preferenceScopesForKey("resume.tone"), ["global", "resume"]);
  assert.deepEqual(preferenceScopesForKey("job_search.work_mode"), ["global", "job_search"]);
  assert.deepEqual(
    preferenceFormErrors({ ...base, scopeKind: "browser_fill", domain: "" }),
    {
      scopeKind: "偏好类型不支持该作用域",
      domain: "浏览器作用域需要精确域名",
    },
  );
  assert.deepEqual(
    preferenceFormErrors({ ...base, scopeKind: "resume", targetFingerprint: "bad" }),
    { targetFingerprint: "目标指纹必须是 64 位十六进制值" },
  );
  assert.equal(preferenceInput({ ...base, scopeKind: "browser_fill", domain: "Jobs.Example" }).scope.domain, "jobs.example");
  assert.deepEqual(
    preferenceInput({
      ...base, scopeKind: "global", domain: "jobs.example", targetFingerprint: "a".repeat(64),
    }).scope,
    { kind: "global" },
  );
});
