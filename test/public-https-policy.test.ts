import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublicHttpsUrl,
  isBlockedHostname,
  isPrivateOrLocalIp,
} from "../src/net/public-https-policy.js";
import { htmlToVisibleText } from "../src/net/html-visible-text.js";
import { fetchPublicHttpsText } from "../src/net/fetch-public-https-text.js";

test("public HTTPS policy rejects credentials, http, and private hosts", () => {
  assert.equal(assertPublicHttpsUrl("https://jobs.example/role").hostname, "jobs.example");
  assert.throws(() => assertPublicHttpsUrl("http://jobs.example/role"), /HTTPS/);
  assert.throws(() => assertPublicHttpsUrl("https://user:pass@jobs.example/role"), /用户名/);
  assert.throws(() => assertPublicHttpsUrl("https://localhost/role"), /内网/);
  assert.throws(() => assertPublicHttpsUrl("https://127.0.0.1/role"), /内网/);
  assert.equal(isBlockedHostname("intranet.local"), true);
  assert.equal(isPrivateOrLocalIp("10.0.0.8"), true);
  assert.equal(isPrivateOrLocalIp("8.8.8.8"), false);
  assert.equal(isPrivateOrLocalIp("::ffff:192.168.1.9"), true);
});

test("HTML visible text strips scripts and keeps a bounded excerpt", () => {
  const text = htmlToVisibleText(
    "<html><head><title>Role</title><script>steal()</script></head><body><p>Build APIs</p></body></html>",
  );
  assert.match(text, /Build APIs/);
  assert.doesNotMatch(text, /steal/);
});

test("public HTTPS fetch follows one public redirect and blocks private DNS", async () => {
  const page = await fetchPublicHttpsText("https://jobs.example/old", {
    lookup: async () => [{ address: "203.0.113.10" }],
    fetch: async (url) => {
      if (url === "https://jobs.example/old") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://jobs.example/new" },
        });
      }
      return new Response(
        "<html><head><title>Staff Engineer</title></head><body><p>Own the billing API.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      );
    },
  });
  assert.equal(page.url, "https://jobs.example/new");
  assert.equal(page.title, "Staff Engineer");
  assert.match(page.text, /billing API/);

  await assert.rejects(
    () => fetchPublicHttpsText("https://jobs.example/role", {
      lookup: async () => [{ address: "10.1.2.3" }],
      fetch: async () => new Response("nope"),
    }),
    /内网/,
  );
});
