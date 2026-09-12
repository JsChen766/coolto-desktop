import assert from "node:assert/strict";
import test from "node:test";

import {
  RECRUITING_FORM_FIXTURE_POLICIES,
  recruitingFormFixturePolicyForOrigin,
  isRecruitingFormFixtureOrigin,
} from "../src/browser/recruiting-form-fixture-policy.js";
import { isBrowserSitePolicyAllowed } from "../src/browser/site-policy-registry.js";
import { recruitingSitePolicyForOrigin } from "../src/browser/recruiting-site-policy.js";

test("synthetic form policy is exact, local, and write-scoped", () => {
  assert.deepEqual(
    RECRUITING_FORM_FIXTURE_POLICIES.map((policy) => policy.siteId),
    ["boss_zhipin", "jobsdb_hk", "linkedin"],
  );
  for (const policy of RECRUITING_FORM_FIXTURE_POLICIES) {
    assert.equal(policy.mode, "synthetic_review");
    assert.equal(policy.trust, "external_untrusted");
    assert.deepEqual(policy.capabilities, [
      "read", "match", "fill", "upload", "field_review",
    ]);
    assert.equal(policy.deniedActions.includes("submit"), true);
    assert.equal(isRecruitingFormFixtureOrigin(policy.origin), true);
    assert.equal(recruitingFormFixturePolicyForOrigin(policy.origin), policy);
  }
});

test("public and malformed origins never become synthetic write targets", () => {
  for (const origin of [
    "https://www.zhipin.com",
    "https://hk.jobsdb.com",
    "https://www.linkedin.com",
    "http://boss-zhipin.test",
    "https://user:pass@boss-zhipin.test",
    "https://boss-zhipin.test.evil.example",
    "https://unknown.test",
  ]) {
    assert.equal(isRecruitingFormFixtureOrigin(origin), false, origin);
    assert.equal(recruitingFormFixturePolicyForOrigin(origin), undefined);
  }
});

test("central Browser registry isolates synthetic writes from generic and submit tools", () => {
  for (const policy of RECRUITING_FORM_FIXTURE_POLICIES) {
    for (const origin of policy.origins) {
      assert.equal(isBrowserSitePolicyAllowed(origin, "browser_recruiting_form_observe"), true);
      assert.equal(isBrowserSitePolicyAllowed(origin, "browser_recruiting_form_fill"), true);
      assert.equal(isBrowserSitePolicyAllowed(origin, "browser_recruiting_form_upload"), true);
      assert.equal(isBrowserSitePolicyAllowed(origin, "browser_recruiting_form_review"), true);
      assert.equal(isBrowserSitePolicyAllowed(origin, "browser_fill_field"), false);
      assert.equal(isBrowserSitePolicyAllowed(origin, "browser_submit"), false);
      assert.equal(isBrowserSitePolicyAllowed(origin, "prepare_application_submission"), false);
    }
  }
});

test("explicit loopback origin is enabled only by the synthetic fixture switch", () => {
  const previous = process.env.COOLTO_RECRUITING_FORM_FIXTURE_ORIGINS;
  process.env.COOLTO_RECRUITING_FORM_FIXTURE_ORIGINS =
    "boss_zhipin=http://127.0.0.1:43127";
  try {
    const origin = "http://127.0.0.1:43127";
    assert.equal(recruitingFormFixturePolicyForOrigin(origin)?.siteId, "boss_zhipin");
    assert.equal(recruitingSitePolicyForOrigin(origin)?.siteId, "boss_zhipin");
    assert.equal(isBrowserSitePolicyAllowed(origin, "browser_recruiting_form_fill"), true);
    assert.equal(isBrowserSitePolicyAllowed(origin, "browser_submit"), false);
  } finally {
    if (previous === undefined) delete process.env.COOLTO_RECRUITING_FORM_FIXTURE_ORIGINS;
    else process.env.COOLTO_RECRUITING_FORM_FIXTURE_ORIGINS = previous;
  }
});

test("unknown origins fail closed for the dedicated form tool family", () => {
  assert.equal(isBrowserSitePolicyAllowed(
    "https://unknown.test", "browser_recruiting_form_observe",
  ), false);
  assert.equal(isBrowserSitePolicyAllowed(
    "https://boss-zhipin.test.evil.example", "browser_recruiting_form_fill",
  ), false);
  assert.equal(isBrowserSitePolicyAllowed(
    "http://boss-zhipin.test", "browser_recruiting_form_review",
  ), false);
});
