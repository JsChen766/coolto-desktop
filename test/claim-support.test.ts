import assert from "node:assert/strict";
import test from "node:test";

import { findUnsupportedClaims } from "../src/resume/quality/claim-support.js";
import { RESUME_SOURCE_SNAPSHOT_SCHEMA_VERSION } from "../src/resume/source-types.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import type {
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
} from "../src/resume/source-types.js";

const SNAPSHOT: ResumeSourceSnapshot = {
  schemaVersion: RESUME_SOURCE_SNAPSHOT_SCHEMA_VERSION,
  capturedAt: "2026-08-01T00:00:00Z",
  sourceFingerprint: "fixture-fingerprint",
  template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  experiences: [
    {
      id: "exp-36kr",
      category: "work",
      title: "分析师实习生",
      organization: "36Kr",
      role: "实习生",
      location: null,
      startDate: "2024-02",
      endDate: "2025-06",
      tags: ["IPO", "尽职调查", "一级市场", "AI"],
      resumeSectionKey: "work",
      resumeSectionLabel: "工作经历",
      revisionId: "rev-1",
      serverRevisionHash: "hash-rev-1",
      contentHash: "hash-content-1",
      updatedAt: "2026-07-02T00:00:00Z",
      content:
        "Conducted weekly monitoring of IPO pipelines (e.g. NEEQ, STAR, GEM), " +
        "identified promising little giant enterprises, led primary due diligence " +
        "and founder interviews for 5+ semi-conductor and pan-AI startups, crafted " +
        "investment memoranda and commercial models for 5+ startups in fundraises.",
    },
    {
      id: "exp-zyzq",
      category: "work",
      title: "机械组股票研究实习生",
      organization: "东吴证券",
      role: "实习生",
      location: null,
      startDate: "2023-07",
      endDate: "2023-10",
      tags: ["半导体", "光伏", "股票研究"],
      resumeSectionKey: "work",
      resumeSectionLabel: "工作经历",
      revisionId: "rev-2",
      serverRevisionHash: "hash-rev-2",
      contentHash: "hash-content-2",
      updatedAt: "2026-07-02T00:00:00Z",
      content:
        "Conducted in-depth fundamental research on 10+ A-share companies across " +
        "photovoltaic, semiconductor and lithium battery equipment sectors; " +
        "independently authored a 20+ page report, focusing on DWI, HJT and SiC.",
    },
  ],
  jd: {
    id: "jd-xiaomi",
    title: "投资者关系实习生",
    company: "小米集团",
    targetRole: "投资者关系实习生",
    rawText: "投资者关系实习生岗位描述。",
    requirements: [],
    serverHash: "jd-server-hash",
    contentHash: "jd-content-hash",
    requirementsOrigin: "parsed",
    updatedAt: "2026-08-01T00:00:00Z",
  },
  profile: {
    userId: "user-1",
    fullName: "陈昊暘",
    contactEmail: "chenandrew418@gmail.com",
    phone: "+852 4765 7136",
    location: null,
    linkedinUrl: null,
    githubUrl: null,
    personalWebsite: null,
    preferredLanguage: "zh-CN",
    resumeStyle: "standard",
  },
};

function binding(
  bulletId: string,
  sourceExperienceId: string,
  bulletText: string,
): BulletEvidenceBinding {
  return {
    bulletId,
    sourceExperienceId,
    bulletText,
    excerpts: [
      {
        experienceId: sourceExperienceId,
        sourceStart: 0,
        sourceEnd: 40,
        sourceQuote: bulletText,
        revisionId: "rev-x",
        revisionContentHash: "hash-x",
      },
    ],
    matchedRequirementIds: [],
  };
}

test("unsupported technology claim: Chinese tag matches English evidence", () => {
  // 36Kr 证据是英文 semi-conductor；bullet 写中文"半导体"不应误报
  const issues = findUnsupportedClaims(SNAPSHOT, [
    binding(
      "b10",
      "exp-36kr",
      "与北创投等 VC 合作，参与 5+ 家半导体与泛 AI 初创企业的一手尽调与创始人访谈",
    ),
  ]);
  assert.equal(
    issues.some((issue) => issue.code === "unsupported_technology_claim"),
    false,
    "中文'半导体'应能对照英文 semi-conductor 证据",
  );
});

test("unsupported technology claim: English abbreviation AI matches Chinese evidence", () => {
  const issues = findUnsupportedClaims(SNAPSHOT, [
    binding(
      "b-ai",
      "exp-36kr",
      "研究生成式人工智能对早期创业公司的影响，分析 50+ 家采用企业",
    ),
  ]);
  assert.equal(
    issues.some((issue) => issue.code === "unsupported_technology_claim"),
    false,
    "中文'人工智能'应能对照英文 AI 标签",
  );
});

test("unsupported technology claim: hyphenated English variant matches", () => {
  const issues = findUnsupportedClaims(SNAPSHOT, [
    binding(
      "b-pv",
      "exp-zyzq",
      "对光伏、半导体与锂电设备领域 10+ 家 A 股公司开展深度基本面研究",
    ),
  ]);
  assert.equal(
    issues.some((issue) => issue.code === "unsupported_technology_claim"),
    false,
    "中文'光伏/半导体/锂电'应能对照英文 photovoltaic/semiconductor/lithium 证据",
  );
});

test("unsupported technology claim: cross-experience tag still flagged", () => {
  // 区块链 tag 只属于假设的另一条经历，36Kr 来源中没有 → 仍然标记
  const snapshot: ResumeSourceSnapshot = {
    ...SNAPSHOT,
    experiences: [
      ...SNAPSHOT.experiences,
      {
        id: "exp-blockchain",
        category: "work",
        title: "区块链研究",
        organization: "其他",
        role: "实习生",
        location: null,
        startDate: "2022-01",
        endDate: "2022-06",
        tags: ["区块链"],
        resumeSectionKey: "work",
        resumeSectionLabel: "工作经历",
        revisionId: "rev-3",
        serverRevisionHash: "hash-rev-3",
        contentHash: "hash-content-3",
        updatedAt: "2026-07-02T00:00:00Z",
        content: "Researched blockchain consensus protocols and smart contracts.",
      },
    ],
  };
  const issues = findUnsupportedClaims(snapshot, [
    binding(
      "b-bc",
      "exp-36kr",
      "对区块链基础设施与智能合约开展系统研究",
    ),
  ]);
  assert.ok(
    issues.some((issue) => issue.code === "unsupported_technology_claim"),
    "引用来源经历之外的技术词仍应标记",
  );
});

test("unsupported technology claim: Chinese responsibility marker unchanged", () => {
  // 责任词校验不受技术词改动影响：证据没有"主导"仍标记
  const issues = findUnsupportedClaims(SNAPSHOT, [
    binding(
      "b-led",
      "exp-36kr",
      "主导 IPO 管道跟踪并输出市场情报简报",
    ),
  ]);
  assert.ok(
    issues.some((issue) => issue.code === "unsupported_responsibility_claim"),
  );
});
