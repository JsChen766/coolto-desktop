import assert from "node:assert/strict";
import test from "node:test";

import { normalizeImportCandidate } from "../src/import/validation.js";
import { normalizeResumeSection } from "../src/resume/contracts/section-contract.js";
import { EvidenceLedger } from "../src/resume/evidence-ledger.js";
import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import { ResumeQualityEvaluator } from "../src/resume/quality/quality-evaluator.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";
import type { ResumeSourceSnapshot } from "../src/resume/source-types.js";
import { buildResumeSkeleton } from "../src/resume/workspace/candidate-skeleton.js";
import { unwrittenExperienceItemIds } from "../src/resume/workspace/candidate-content.js";
import { collectSkillHints } from "../src/resume/workspace/section-registry.js";

test("custom sections normalize, remain open, and preserve fixed display order", () => {
  const structure = buildResumeSkeleton(snapshot, snapshot.experiences.map((item) => item.id), "zh-CN");
  assert.deepEqual(structure.sections.map((section) => section.heading), [
    "教育经历", "工作经历", "项目经历", "论文", "获奖", "证书", "研究", "社团", "专业技能",
  ]);
  assert.deepEqual(unwrittenExperienceItemIds(structure), [
    "item-work", "item-project", "item-paper", "item-award", "item-certificate",
    "item-research", "item-club", "item-skills",
  ]);
  assert.deepEqual(normalizeResumeSection({
    coreCategory: "other", sectionKey: "Future-Unknown", sectionLabel: "未来合法类型",
  }), { coreCategory: "other", sectionKey: "future-unknown", sectionLabel: "未来合法类型" });
  assert.deepEqual(collectSkillHints(snapshot.experiences), ["Research", "Python"]);
});

test("work and project items are ordered newest first inside their sections", () => {
  const dated = structuredClone(snapshot);
  dated.experiences = [
    dated.experiences.find((entry) => entry.category === "education")!,
    datedExperience("work-old", "work", "2022-01", "2023-06"),
    datedExperience("project-current", "project", "2023-02", "present"),
    datedExperience("work-current", "work", "2021-01", "present"),
    datedExperience("project-undated", "project", null, null),
    datedExperience("work-new", "work", "2024-02", "2025-06"),
    datedExperience("project-new", "project", "2025-02", "2025-07"),
    datedExperience("project-old", "project", "2023-07", "2023-10"),
  ];
  const structure = buildResumeSkeleton(
    dated,
    dated.experiences.map((entry) => entry.id),
    "zh-CN",
  );

  assert.deepEqual(itemIds(structure, "experience"), [
    "item-work-current", "item-work-new", "item-work-old",
  ]);
  assert.deepEqual(itemIds(structure, "project"), [
    "item-project-current", "item-project-new", "item-project-old",
    "item-project-undated",
  ]);
});

test("imports require normalized paired keys and retain legacy five categories", () => {
  const paper = normalizeImportCandidate({
    category: "other", title: "论文", content: "发表论文：可验证原文。",
    resumeSectionKey: "papers", resumeSectionLabel: "论文", tags: ["Research"],
  }, "paper");
  assert.equal(paper.resumeSectionKey, "papers");
  assert.throws(() => normalizeImportCandidate({
    category: "other", title: "坏数据", content: "事实", resumeSectionKey: "papers",
  }, "bad"));
  const legacy = normalizeImportCandidate({ category: "volunteer", title: "社团", content: "组织活动" }, "legacy");
  assert.equal(legacy.category, "volunteer");
  assert.equal(legacy.resumeSectionKey, undefined);
});

test("additional facts cannot obtain a ledger binding without exact snapshot evidence", () => {
  const ledger = new EvidenceLedger(snapshot);
  assert.throws(() => ledger.reserve({
    bulletId: "paper-bullet", sourceExperienceId: "paper", bulletText: "发表论文。",
    excerpts: [], matchedRequirementIds: [],
  }), /must cite at least one source excerpt/);
});

test("quality review rejects raw text in additional and skill sections", () => {
  const structure = buildResumeSkeleton(snapshot, snapshot.experiences.map((item) => item.id), "en-US");
  const paper = structure.sections.find((section) => section.id === "section-custom-papers")!;
  paper.items[0]!.raw_text = "Unbound paper summary";
  const report = new ResumeQualityEvaluator().evaluate(
    snapshot, structure, [], { violations: [] } as unknown as ResumeCompileResult,
  );
  assert.ok(report.issues.some((issue) => issue.code === "unbound_additional_content"));
  assert.equal(report.passed, false);
});

const snapshot: ResumeSourceSnapshot = {
  schemaVersion: "resume-source-snapshot-v1", capturedAt: "2026-08-03T00:00:00Z", sourceFingerprint: "snapshot",
  profile: { userId: "user", fullName: "Alice", contactEmail: "alice@example.com", phone: "1", location: null,
    linkedinUrl: null, githubUrl: null, personalWebsite: null, preferredLanguage: null, resumeStyle: null },
  jd: { id: "jd", title: "Role", company: null, targetRole: null, rawText: "role", requirements: [],
    serverHash: null, contentHash: "jd", requirementsOrigin: "manual", updatedAt: "2026-08-03T00:00:00Z" },
  experiences: [
    item("education", "edu", null, null), item("work", "work", null, null), item("project", "project", null, null),
    item("other", "paper", "papers", "论文"), item("other", "award", "awards", "获奖"),
    item("other", "certificate", "certificates", "证书"), item("other", "research", "research", "研究"),
    item("other", "club", "activities", "社团"), item("other", "skills", "skills", "专业技能"),
  ], template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
};

function item(category: "education" | "work" | "project" | "other", id: string, key: string | null, label: string | null) {
  return { id, category, title: id, organization: null, role: null, location: null, startDate: null, endDate: null,
    tags: [id === "skills" ? "Python" : "Research"], resumeSectionKey: key, resumeSectionLabel: label,
    revisionId: `revision-${id}`, serverRevisionHash: null, contentHash: `hash-${id}`,
    content: `${id} 的可验证事实。`, updatedAt: "2026-08-03T00:00:00Z" };
}

function datedExperience(
  id: string,
  category: "work" | "project",
  startDate: string | null,
  endDate: string | null,
) {
  return { ...item(category, id, null, null), startDate, endDate };
}

function itemIds(
  structure: ReturnType<typeof buildResumeSkeleton>,
  type: "experience" | "project",
): string[] {
  return structure.sections.find((section) => section.type === type)
    ?.items.map((entry) => entry.id) ?? [];
}
