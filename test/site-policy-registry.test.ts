import assert from "node:assert/strict";
import test from "node:test";

import {
  browserSitePolicyForOrigin,
  isBrowserSitePolicyAllowed,
  QQ_MAIL_SITE_POLICY,
} from "../src/browser/site-policy-registry.js";

test("QQ personal mail policy is explicit, supervised and send-denied", () => {
  assert.equal(QQ_MAIL_SITE_POLICY.status, "candidate");
  assert.equal(QQ_MAIL_SITE_POLICY.loginMode, "user_takeover");
  assert.deepEqual(QQ_MAIL_SITE_POLICY.domains, ["mail.qq.com"]);
  assert.ok(QQ_MAIL_SITE_POLICY.deniedActions.includes("mail.send"));
  assert.ok(QQ_MAIL_SITE_POLICY.deniedActions.includes("attachment.download"));
  assert.match(QQ_MAIL_SITE_POLICY.knownSideEffects[0]!, /已读/u);
  assert.equal(
    browserSitePolicyForOrigin("https://mail.qq.com")?.id,
    QQ_MAIL_SITE_POLICY.id,
  );
  assert.equal(browserSitePolicyForOrigin("https://exmail.qq.com"), undefined);
});

test("QQ mail capture is fail-closed except in an explicit acceptance run", () => {
  const previous = process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS;
  delete process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS;
  try {
    assert.equal(isBrowserSitePolicyAllowed(
      "https://mail.qq.com", "capture_browser_mail_event",
    ), false);
    process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS = "https://mail.qq.com";
    assert.equal(isBrowserSitePolicyAllowed(
      "https://mail.qq.com", "capture_browser_mail_event",
    ), true);
    assert.equal(isBrowserSitePolicyAllowed(
      "https://exmail.qq.com", "capture_browser_mail_event",
    ), false);
  } finally {
    if (previous === undefined) delete process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS;
    else process.env.COOLTO_BROWSER_SITE_ACCEPTANCE_ORIGINS = previous;
  }
});
