import assert from "node:assert/strict";
import test from "node:test";

import {
  browserSitePolicyForOrigin,
  isBrowserSitePolicyAllowed,
  NETEASE_163_PERSONAL_SITE_POLICY,
  OUTLOOK_PERSONAL_SITE_POLICY,
  QQ_MAIL_SITE_POLICY,
} from "../src/browser/site-policy-registry.js";

test("personal Webmail policies are explicit, supervised and send-denied", () => {
  const cases = [
    [QQ_MAIL_SITE_POLICY, ["mail.qq.com"]],
    [OUTLOOK_PERSONAL_SITE_POLICY, [
      "outlook.live.com", "outlook.office.com", "outlook.cloud.microsoft",
    ]],
    [NETEASE_163_PERSONAL_SITE_POLICY, ["mail.163.com", "hw.mail.163.com"]],
  ] as const;
  for (const [policy, domains] of cases) {
    assert.equal(policy.status, "candidate");
    assert.equal(policy.loginMode, "user_takeover");
    assert.deepEqual(policy.domains, domains);
    assert.ok(policy.deniedActions.includes("mail.send"));
    assert.ok(policy.deniedActions.includes("mail.delete"));
    assert.ok(policy.deniedActions.includes("attachment.download"));
    assert.match(policy.knownSideEffects[0]!, /已读/u);
  }
  assert.equal(
    browserSitePolicyForOrigin("https://mail.qq.com")?.id,
    QQ_MAIL_SITE_POLICY.id,
  );
  assert.equal(
    browserSitePolicyForOrigin("https://outlook.live.com")?.id,
    OUTLOOK_PERSONAL_SITE_POLICY.id,
  );
  assert.equal(
    browserSitePolicyForOrigin("https://outlook.office.com")?.id,
    OUTLOOK_PERSONAL_SITE_POLICY.id,
  );
  assert.equal(
    browserSitePolicyForOrigin("https://outlook.cloud.microsoft")?.id,
    OUTLOOK_PERSONAL_SITE_POLICY.id,
  );
  assert.equal(
    browserSitePolicyForOrigin("https://mail.163.com")?.id,
    NETEASE_163_PERSONAL_SITE_POLICY.id,
  );
  assert.equal(
    browserSitePolicyForOrigin("https://hw.mail.163.com")?.id,
    NETEASE_163_PERSONAL_SITE_POLICY.id,
  );
  assert.equal(browserSitePolicyForOrigin("https://exmail.qq.com"), undefined);
  assert.equal(browserSitePolicyForOrigin("https://tenant.sharepoint.com"), undefined);
  assert.equal(browserSitePolicyForOrigin("https://mail.126.com"), undefined);
});

test("candidate Webmail capture is fail-closed except for exact acceptance origins", () => {
  const previous = process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS;
  delete process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS;
  try {
    for (const origin of [
      "https://mail.qq.com",
      "https://outlook.live.com",
      "https://outlook.office.com",
      "https://outlook.cloud.microsoft",
      "https://mail.163.com",
      "https://hw.mail.163.com",
    ]) {
      assert.equal(isBrowserSitePolicyAllowed(
        origin, "capture_browser_mail_event",
      ), false);
    }
    process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS =
      "https://outlook.live.com,https://outlook.office.com,https://outlook.cloud.microsoft,https://mail.163.com,https://hw.mail.163.com";
    assert.equal(isBrowserSitePolicyAllowed(
      "https://outlook.live.com", "capture_browser_mail_event",
    ), true);
    assert.equal(isBrowserSitePolicyAllowed(
      "https://outlook.office.com", "capture_browser_mail_event",
    ), true);
    assert.equal(isBrowserSitePolicyAllowed(
      "https://outlook.cloud.microsoft", "capture_browser_mail_event",
    ), true);
    assert.equal(isBrowserSitePolicyAllowed(
      "https://mail.163.com", "capture_browser_mail_event",
    ), true);
    assert.equal(isBrowserSitePolicyAllowed(
      "https://hw.mail.163.com", "capture_browser_mail_event",
    ), true);
    assert.equal(isBrowserSitePolicyAllowed(
      "https://mail.qq.com", "capture_browser_mail_event",
    ), false);
    assert.equal(isBrowserSitePolicyAllowed(
      "https://exmail.qq.com", "capture_browser_mail_event",
    ), false);
  } finally {
    if (previous === undefined) delete process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS;
    else process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS = previous;
  }
});
