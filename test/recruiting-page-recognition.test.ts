import assert from "node:assert/strict";
import test from "node:test";

import type { RecruitingPageObservation } from
  "../src/agent-task/recruiting-surface-types.js";
import {
  recruitingObservationIsCurrent,
  recognizeRecruitingPage,
} from "../src/browser/recruiting-page-recognition.js";

const origin = "https://boss-zhipin.test";

function page(overrides: Partial<RecruitingPageObservation>): RecruitingPageObservation {
  return {
    origin,
    url: `${origin}/jobs`,
    title: "Jobs",
    headings: [],
    landmarks: [],
    formSummaries: [],
    accessibility: [],
    frameShadowSummary: { sameOriginFrames: 0, crossOriginFrames: 0, openShadowRoots: 0 },
    observationHash: "observation-1",
    ...overrides,
  };
}

test("recognizes listing, detail and application surfaces", () => {
  assert.deepEqual(recognizeRecruitingPage(page({
    title: "Backend Engineer jobs", headings: ["Job listings"],
    text: "Sign in · Privacy · EEO",
    accessibility: [
      { role: "link", name: "Sign in" },
      { role: "link", name: "Privacy" },
      { role: "link", name: "EEO" },
    ],
  })), {
    siteId: "boss_zhipin", surfaceKind: "job_listing",
    capabilities: ["read", "match"], fallback: "read_only",
    observationHash: "observation-1",
  });
  assert.deepEqual(recognizeRecruitingPage(page({
    url: `${origin}/jobs/backend-engineer-1`, title: "Backend Engineer",
    headings: ["Apply now"],
  })), {
    siteId: "boss_zhipin", surfaceKind: "job_detail",
    capabilities: ["read", "match"], fallback: "read_only",
    observationHash: "observation-1",
  });
  const form = recognizeRecruitingPage(page({
    url: `${origin}/jobs/backend-engineer-1/apply`, title: "Apply for Backend Engineer",
    formSummaries: [
      { label: "Resume upload", name: "resume", inputType: "file", required: true },
      { label: "Email", name: "email", inputType: "email", required: true },
    ],
    text: "Sign in | Privacy | EEO",
  }));
  assert.equal(form.surfaceKind, "application_form");
  assert.deepEqual(form.capabilities, [
    "read", "match", "fill", "upload", "field_review",
    "final_submit_confirmation_required",
  ]);
  assert.equal(form.fallback, "manual_takeover");
});

test("LinkedIn public job pages ignore header and footer noise", () => {
  const result = recognizeRecruitingPage(page({
    origin: "https://linkedin.test",
    url: "https://linkedin.test/jobs/view/123",
    title: "Senior Platform Engineer | LinkedIn",
    headings: ["Senior Platform Engineer"],
    landmarks: ["main", "contentinfo"],
    text: "Senior Platform Engineer Sign in Privacy EEO",
    accessibility: [
      { role: "navigation", name: "Sign in" },
      { role: "contentinfo", name: "Privacy EEO" },
    ],
  }));
  assert.deepEqual(result, {
    siteId: "linkedin", surfaceKind: "job_detail",
    capabilities: ["read", "match"], fallback: "read_only",
    observationHash: "observation-1",
  });
});

test("recognizes authentication and high-risk surfaces before generic forms", () => {
  const cases: Array<[string, RecruitingPageObservation, string[]]> = [
    ["auth", page({ title: "Sign in", formSummaries: [{ label: "Password", inputType: "password" }] }), ["takeover_required"]],
    ["otp", page({ title: "Verify code", headings: ["One-time verification code"] }), ["takeover_required"]],
    ["captcha", page({ title: "CAPTCHA verification" }), ["takeover_required"]],
    ["legal_declaration", page({ title: "Legal consent", formSummaries: [{ label: "I agree", inputType: "checkbox" }] }), ["takeover_required"]],
    ["sensitive_question", page({ title: "EEO questions", headings: ["Gender"] }), ["takeover_required"]],
    ["submit_confirmation", page({ title: "Application received" }), ["takeover_required", "final_submit_confirmation_required"]],
  ];
  for (const [surfaceKind, input, capabilities] of cases) {
    const result = recognizeRecruitingPage(input);
    assert.equal(result.surfaceKind, surfaceKind);
    assert.deepEqual(result.capabilities, capabilities);
    assert.equal(result.fallback, "manual_takeover");
  }
});

test("unknown origins fail closed while known sites retain site identity", () => {
  for (const input of [
    page({ origin: "https://unknown.test", title: "Backend Engineer jobs" }),
    page({ url: "http://boss-zhipin.test/jobs", title: "Backend Engineer jobs" }),
    page({
      url: "https://user:pass@boss-zhipin.test/jobs",
      title: "Backend Engineer jobs",
    }),
  ]) {
    assert.deepEqual(recognizeRecruitingPage(input), {
      siteId: "unknown", surfaceKind: "unknown", capabilities: ["unsupported"],
      fallback: "unsupported", observationHash: "observation-1",
    });
  }
  assert.deepEqual(recognizeRecruitingPage(page({
    title: "Company home", url: `${origin}/about`,
  })), {
    siteId: "boss_zhipin", surfaceKind: "unknown", capabilities: ["unsupported"],
    fallback: "unsupported", observationHash: "observation-1",
  });
});

test("production origins retain site identity while challenge pages stay honest", () => {
  const cases = [
    {
      siteId: "boss_zhipin",
      origin: "https://www.zhipin.com",
      url: "https://www.zhipin.com/",
      title: "BOSS直聘-找工作",
      text: "BOSS直聘 招聘 求职 找工作",
      surfaceKind: "job_listing",
      capabilities: ["read", "match"],
    },
    {
      siteId: "linkedin",
      origin: "https://www.linkedin.com",
      url: "https://www.linkedin.com/jobs/",
      title: "LinkedIn Job Search",
      text: "Find the right job or internship for you",
      surfaceKind: "job_listing",
      capabilities: ["read", "match"],
    },
    {
      siteId: "jobsdb_hk",
      origin: "https://hk.jobsdb.com",
      url: "https://hk.jobsdb.com/",
      title: "请稍候…",
      text: "hk.jobsdb.com正在进行安全验证，验证您不是自动程序。隐私",
      surfaceKind: "captcha",
      capabilities: ["takeover_required"],
    },
  ] as const;
  for (const value of cases) {
    const result = recognizeRecruitingPage(page(value));
    assert.equal(result.siteId, value.siteId);
    assert.equal(result.surfaceKind, value.surfaceKind);
    assert.deepEqual(result.capabilities, value.capabilities);
    assert.equal(
      result.fallback,
      value.surfaceKind === "job_listing" ? "read_only" : "manual_takeover",
    );
  }
  for (const url of [
    "https://www.zhipin.com.evil.example/jobs",
    "https://hk.jobsdb.com.evil.example/",
    "https://www.linkedin.com.evil.example/jobs",
    "https://www.linkedin.co/jobs",
  ]) {
    const result = recognizeRecruitingPage(page({
      origin: url, url, title: "Backend Engineer jobs", text: "招聘",
    }));
    assert.equal(result.siteId, "unknown");
    assert.equal(result.surfaceKind, "unknown");
    assert.deepEqual(result.capabilities, ["unsupported"]);
    assert.equal(result.fallback, "unsupported");
  }
});

test("missing or drifting observations remove write capability", () => {
  const missing = recognizeRecruitingPage(page({
    title: "Apply for a role",
    formSummaries: [{ label: "Resume", inputType: "file" }],
    observationHash: null,
  }));
  assert.equal(missing.surfaceKind, "application_form");
  assert.deepEqual(missing.capabilities, ["read", "match", "takeover_required"]);
  assert.equal(recruitingObservationIsCurrent(missing, "observation-1"), false);

  const current = recognizeRecruitingPage(page({
    title: "Apply for a role",
    formSummaries: [{ label: "Resume", inputType: "file" }],
  }));
  assert.equal(recruitingObservationIsCurrent(current, "observation-1"), true);
  assert.equal(recruitingObservationIsCurrent(current, "observation-2"), false);
});
