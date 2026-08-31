import assert from "node:assert/strict";
import test from "node:test";

import { browserPageHandoff } from "../src/browser/browser-page-handoff.js";

test("page handoff keeps a useful page identity while removing URL secrets", () => {
  const view = browserPageHandoff({
    title: "  Senior Engineer\u0000  ",
    url: "https://user:secret@jobs.example/roles/42?jobId=42&token=private#application",
  });
  assert.deepEqual(view, {
    title: "Senior Engineer",
    url: "https://jobs.example/roles/42?jobId=42#application",
  });
  assert.doesNotMatch(JSON.stringify(view), /secret|token=private/u);
  assert.match(view!.url, /jobId=42#application/u);
});

test("page handoff removes secret-bearing hash fragments", () => {
  const view = browserPageHandoff({
    title: "Role",
    url: "https://jobs.example/roles/42?jobId=42#access_token=private",
  });
  assert.deepEqual(view, {
    title: "Role",
    url: "https://jobs.example/roles/42?jobId=42",
  });
});

test("page handoff rejects internal and non-web pages", () => {
  assert.equal(browserPageHandoff({ title: "Home", url: null }), null);
  assert.equal(browserPageHandoff({ title: "File", url: "file:///tmp/a" }), null);
  assert.equal(browserPageHandoff({ title: "Data", url: "data:text/html,a" }), null);
});
