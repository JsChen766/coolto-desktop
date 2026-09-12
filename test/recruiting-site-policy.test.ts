import assert from "node:assert/strict";
import test from "node:test";

import {
  BOSS_ZHIPIN_SITE_POLICY,
  JOBSDB_HK_SITE_POLICY,
  LINKEDIN_SITE_POLICY,
  RECRUITING_SITE_POLICIES,
  isRecruitingSitePolicyAllowed,
  recruitingSitePolicyForOrigin,
  recruitingSitePolicyForHost,
  recruitingSitePolicyForSite,
} from "../src/browser/recruiting-site-policy.js";
import { isBrowserSitePolicyAllowed } from "../src/browser/site-policy-registry.js";

test("first recruiting sites are independent candidate policies", () => {
  assert.deepEqual(
    RECRUITING_SITE_POLICIES.map((policy) => policy.siteId),
    ["boss_zhipin", "jobsdb_hk", "linkedin"],
  );
  for (const policy of RECRUITING_SITE_POLICIES) {
    assert.equal(policy.status, "candidate");
    assert.equal(policy.verifiedAt, null);
    assert.equal(policy.contentTrust, "external_untrusted");
    assert.equal(policy.termsEvidence, null);
    assert.equal(policy.authorizationEvidence, null);
    assert.equal(policy.rateLimit, null);
    assert.equal(policy.defaultMode, "assisted");
    assert.ok(policy.capabilities.includes("read"));
    assert.ok(policy.capabilities.includes("fill"));
    assert.ok(policy.capabilities.includes("upload"));
    assert.ok(policy.capabilities.includes("field_review"));
    assert.ok(policy.capabilities.includes("final_submit_confirmation_required"));
    assert.ok(policy.deniedActions.includes("password.write"));
    assert.ok(policy.deniedActions.includes("captcha.solve"));
    assert.ok(policy.deniedActions.includes("browser.submit.unattended"));
    assert.equal(
      recruitingSitePolicyForOrigin(`${policy.fixtureOrigins[0]}/jobs/1`)?.siteId,
      policy.siteId,
    );
  }
  assert.equal(recruitingSitePolicyForSite("boss_zhipin"), BOSS_ZHIPIN_SITE_POLICY);
  assert.equal(recruitingSitePolicyForSite("jobsdb_hk"), JOBSDB_HK_SITE_POLICY);
  assert.equal(recruitingSitePolicyForSite("linkedin"), LINKEDIN_SITE_POLICY);
});

test("candidate policy never implies verified production support", () => {
  assert.equal(recruitingSitePolicyForOrigin("https://www.linkedin.com"), LINKEDIN_SITE_POLICY);
  assert.equal(recruitingSitePolicyForOrigin("https://bosszhipin.com"), undefined);
  assert.equal(recruitingSitePolicyForOrigin("http://boss-zhipin.test"), undefined);
  for (const origin of [
    "http://boss-zhipin.test",
    "https://user:pass@boss-zhipin.test",
  ]) {
    assert.equal(isBrowserSitePolicyAllowed(origin, "browser_fill_field"), false);
  }
  assert.equal(
    isRecruitingSitePolicyAllowed(
      BOSS_ZHIPIN_SITE_POLICY.fixtureOrigins[0]!, "read",
    ),
    true,
  );
  assert.equal(
    isRecruitingSitePolicyAllowed(
      BOSS_ZHIPIN_SITE_POLICY.fixtureOrigins[0]!, "match",
    ),
    true,
  );
  assert.equal(
    isRecruitingSitePolicyAllowed(
      BOSS_ZHIPIN_SITE_POLICY.fixtureOrigins[0]!, "takeover_required",
    ),
    true,
  );
  assert.equal(
    isRecruitingSitePolicyAllowed("https://unknown.test", "read"),
    false,
  );
  assert.equal(
    isRecruitingSitePolicyAllowed(BOSS_ZHIPIN_SITE_POLICY.fixtureOrigins[0]!, "unsupported"),
    false,
  );
  assert.equal(
    isRecruitingSitePolicyAllowed(BOSS_ZHIPIN_SITE_POLICY.fixtureOrigins[0]!, "fill"),
    false,
  );
  assert.equal(
    isRecruitingSitePolicyAllowed(BOSS_ZHIPIN_SITE_POLICY.fixtureOrigins[0]!, "upload"),
    false,
  );
  assert.equal(
    isRecruitingSitePolicyAllowed(
      BOSS_ZHIPIN_SITE_POLICY.fixtureOrigins[0]!, "field_review",
    ),
    false,
  );
  assert.equal(
    isRecruitingSitePolicyAllowed(
      BOSS_ZHIPIN_SITE_POLICY.fixtureOrigins[0]!,
      "final_submit_confirmation_required",
    ),
    false,
  );
});

test("production origins and hosts are exact while candidate writes stay denied", () => {
  const cases = [
    {
      policy: BOSS_ZHIPIN_SITE_POLICY,
      origin: "https://www.zhipin.com",
      host: "www.zhipin.com",
    },
    {
      policy: JOBSDB_HK_SITE_POLICY,
      origin: "https://hk.jobsdb.com",
      host: "hk.jobsdb.com",
    },
    {
      policy: LINKEDIN_SITE_POLICY,
      origin: "https://www.linkedin.com",
      host: "www.linkedin.com",
    },
  ] as const;
  for (const { policy, origin, host } of cases) {
    assert.deepEqual(policy.productionOrigins, [origin]);
    assert.equal(recruitingSitePolicyForOrigin(`${origin}/jobs`)?.siteId, policy.siteId);
    assert.equal(recruitingSitePolicyForHost(host)?.siteId, policy.siteId);
    assert.equal(recruitingSitePolicyForOrigin(`https://${host}.evil.example`), undefined);
    assert.equal(recruitingSitePolicyForHost(`${host}.evil.example`), undefined);
    assert.equal(recruitingSitePolicyForOrigin(`https://user:pass@${host}`), undefined);
    assert.equal(isRecruitingSitePolicyAllowed(origin, "read"), true);
    for (const capability of [
      "fill", "upload", "field_review", "final_submit_confirmation_required",
    ] as const) {
      assert.equal(isRecruitingSitePolicyAllowed(origin, capability), false, capability);
    }
    assert.equal(isBrowserSitePolicyAllowed(origin, "browser_snapshot"), true);
    for (const toolName of [
      "browser_fill_field", "browser_upload_frozen_resume", "browser_submit",
    ]) {
      assert.equal(isBrowserSitePolicyAllowed(origin, toolName), false, toolName);
    }
  }
});

test("browser policy registry keeps candidate recruiting origins read/navigation only", () => {
  const candidate = BOSS_ZHIPIN_SITE_POLICY.fixtureOrigins[0]!;
  for (const toolName of [
    "extract_page", "browser_snapshot", "browser_query_elements",
    "browser_wait_for", "browser_navigate", "browser_reload",
  ]) {
    assert.equal(isBrowserSitePolicyAllowed(candidate, toolName), true, toolName);
  }
  for (const toolName of [
    "browser_fill_field", "browser_upload_frozen_resume",
    "browser_start_review", "prepare_application_submission",
    "browser_download", "capture_browser_mail_event", "browser_submit",
  ]) {
    assert.equal(isBrowserSitePolicyAllowed(candidate, toolName), false, toolName);
  }
});
