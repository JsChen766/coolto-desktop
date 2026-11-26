import assert from "node:assert/strict";
import test from "node:test";

import { fetchGreenhouseJobs } from "../src/job-scout/greenhouse-job-source.js";
import { fetchLeverJobs } from "../src/job-scout/lever-job-source.js";
import {
  decodeHtmlEntitiesOnce,
  plainText,
} from "../src/job-scout/job-source-fetch.js";

const response = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { "content-type": "application/json" },
});

// Shaped like the live Job Board API: `content` is entity-escaped HTML, and
// entities inside the HTML are double-escaped (&amp;nbsp;, &amp;lt;).
const ESCAPED_CONTENT =
  "&lt;div class=&quot;intro&quot;&gt;&lt;p&gt;About&amp;nbsp;us &amp;amp; you" +
  "&lt;/p&gt;&lt;script&gt;x()&lt;/script&gt;&lt;style&gt;p{color:red}&lt;/style&gt;" +
  "&lt;p&gt;Need &amp;lt;5 years&lt;/p&gt;&lt;/div&gt;";

test("Greenhouse escaped content is decoded before tags are stripped", async () => {
  const result = await fetchGreenhouseJobs("example", "Acme", async () =>
    response({ jobs: [{
      id: 7, title: "Backend Engineer", location: { name: "Remote" },
      content: ESCAPED_CONTENT,
      absolute_url: "https://boards.greenhouse.io/acme/jobs/7",
      updated_at: "2026-08-23T00:00:00Z",
    }] }),
  );
  const description = result.listings[0]?.description ?? "";
  assert.equal(description, "About us & you Need <5 years");
  assert.doesNotMatch(description, /<[a-z/]/iu);
  assert.doesNotMatch(description, /&nbsp;|&amp;|&lt;|&quot;/iu);
  assert.doesNotMatch(description, /x\(\)|color:red/u);
});

test("Greenhouse unescaped content still yields plain text", async () => {
  const result = await fetchGreenhouseJobs("example", "Acme", async () =>
    response({ jobs: [{
      id: 8, title: "Engineer",
      content: "<p>Build &amp; scale APIs</p>",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/8",
    }] }),
  );
  assert.equal(result.listings[0]?.description, "Build & scale APIs");
});

test("decodeHtmlEntitiesOnce undoes exactly one level of escaping", () => {
  assert.equal(
    decodeHtmlEntitiesOnce("&lt;a href=&quot;x&quot;&gt;it&#39;s &amp;amp; &amp;lt;&lt;/a&gt;"),
    "<a href=\"x\">it's &amp; &lt;</a>",
  );
  assert.equal(decodeHtmlEntitiesOnce(undefined), "");
  assert.equal(decodeHtmlEntitiesOnce(null), "");
});

test("shared plainText keeps Lever's unescaped HTML fallback intact", async () => {
  assert.equal(plainText("<p>Need &lt;5 years</p>"), "Need <5 years");
  const lever = await fetchLeverJobs("example", "Beta", async () =>
    response([{ id: "job-2", text: "Platform Engineer",
      hostedUrl: "https://jobs.lever.co/beta/job-2",
      description: "<p>Need &lt;5 years &amp; Go</p>",
      categories: { location: "Hong Kong" }, createdAt: 1_787_472_000_000 }]),
  );
  assert.equal(lever.listings[0]?.description, "Need <5 years & Go");
});
