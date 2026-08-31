import assert from "node:assert/strict";
import test from "node:test";

import { evaluateClickTarget } from "../src/desktop/main/browser/browser-click-guards.js";
import { isBrowserSitePolicyAllowed } from "../src/browser/site-policy-registry.js";
import type { ClickTargetHint } from "../src/desktop/main/browser/browser-click-guards.js";

const ORIGIN = "https://outlook.live.com";

test("managed Webmail exposes only read/navigation browser tools", () => {
  for (const origin of [
    ORIGIN, "https://outlook.office.com", "https://outlook.cloud.microsoft",
  ]) for (const tool of [
    "browser_snapshot", "browser_query_elements", "browser_wait_for",
    "browser_tag_elements", "browser_click_element", "browser_scroll_to",
    "browser_hover", "browser_select_tab", "browser_reload", "extract_page",
  ]) {
    assert.equal(isBrowserSitePolicyAllowed(origin, tool), true, `${origin} ${tool}`);
  }
  for (const origin of [
    ORIGIN, "https://outlook.office.com", "https://outlook.cloud.microsoft",
  ]) for (const tool of [
    "browser_fill_field", "browser_select_option", "browser_set_checked",
    "browser_upload_file", "browser_keypress", "browser_drag",
    "browser_download", "browser_start_review", "browser_submit",
    "prepare_application_submission",
  ]) {
    assert.equal(isBrowserSitePolicyAllowed(origin, tool), false, `${origin} ${tool}`);
  }
});

test("read-only Webmail click guard allows message navigation", () => {
  assert.deepEqual(evaluateClickTarget(hint({
    tagName: "div", role: "option",
    ariaLabel: "Recruiter - Interview invitation - 10:00",
  }), ORIGIN), { allow: true });
  assert.deepEqual(evaluateClickTarget(hint({
    tagName: "a", role: "link", text: "Next page",
    href: "https://outlook.live.com/mail/next",
  }), ORIGIN), { allow: true });
  assert.deepEqual(evaluateClickTarget(hint({
    tagName: "button", role: "button", ariaLabel: "Refresh",
  }), ORIGIN), { allow: true });
  assert.deepEqual(evaluateClickTarget(hint({
    tagName: "div", role: "option",
    ariaLabel: "External email. Do not reply or open attachments. Verify the sender.",
  }), ORIGIN), { allow: true });
  assert.deepEqual(evaluateClickTarget(hint({
    tagName: "div", role: "link", className: "rF0 kw0 nui-txt-flag0",
    text: "Jiansheng Chen Coolto BE5 163 QA 20260829 00:05",
  }), "https://hw.mail.163.com"), { allow: true });
});

test("read-only Webmail click guard blocks destructive and unknown controls", () => {
  for (const label of [
    "Delete", "Archive", "Move to", "Mark as read", "Report junk",
    "Settings", "Reply", "Forward", "New mail", "Download attachment",
  ]) {
    const result = evaluateClickTarget(hint({
      tagName: "button", role: "button", ariaLabel: label,
    }), ORIGIN);
    assert.equal(result.allow, false, label);
  }
  assert.equal(evaluateClickTarget(hint({
    tagName: "div", role: "link", className: "rF0 kw0 nui-txt-flag0",
    text: "删除邮件",
  }), "https://hw.mail.163.com").allow, false);
  assert.equal(evaluateClickTarget(hint({
    tagName: "a", role: "link", text: "External",
    href: "https://evil.example/collect",
  }), ORIGIN).allow, false);
  assert.equal(evaluateClickTarget(hint({
    tagName: "button", role: "button",
  }), ORIGIN).allow, false);
});

test("non-Webmail click behavior remains unchanged", () => {
  assert.deepEqual(evaluateClickTarget(hint({
    tagName: "button", role: "button", ariaLabel: "Open details",
  }), "https://jobs.example"), { allow: true });
});

function hint(overrides: Partial<ClickTargetHint>): ClickTargetHint {
  return {
    tagName: "div", type: null, role: null, ariaLabel: "", text: "",
    value: "", name: "", id: "", testId: "", title: "", href: "",
    download: false, inForm: false, ...overrides,
  };
}
