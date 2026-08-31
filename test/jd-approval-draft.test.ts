import assert from "node:assert/strict";
import test from "node:test";

import {
  JD_SAVE_ACTION_TYPE,
  JD_SAVE_APPROVAL_SCOPE,
  createJdSaveApprovalDraft,
  createJdSaveApprovalPayload,
} from "../src/jd/approval-draft.js";
import { JdProposalStore } from "../src/jd/proposal-store.js";

function makeProposal({
  company = null,
  targetRole = null,
  requirementCount = 2,
}: {
  company?: string | null;
  targetRole?: string | null;
  requirementCount?: number;
} = {}) {
  const store = new JdProposalStore();
  const reqs = Array.from({ length: requirementCount }, (_, i) => ({
    clientId: `req-${i + 1}`,
    text: `要求${i + 1}`,
    category: "skill",
    importance: "high" as const,
    keywords: [],
    v2Importance: null,
    v2Category: null,
  }));
  return store.create(
    "原始 JD 文本",
    "高级前端工程师",
    company,
    targetRole,
    reqs,
    { kind: "browser", url: "https://jobs.example/frontend" },
  );
}

test("draft has correct actionType and risk", () => {
  const draft = createJdSaveApprovalDraft(makeProposal());
  assert.equal(draft.actionType, JD_SAVE_ACTION_TYPE);
  assert.equal(draft.scopeKey, JD_SAVE_APPROVAL_SCOPE);
  assert.equal(draft.risk, "write");
});

test("draft preview summary always contains 岗位 and 要求数量", () => {
  const draft = createJdSaveApprovalDraft(makeProposal({ requirementCount: 3 }));
  const summary = draft.preview?.summary ?? [];
  const titleEntry = summary.find((s) => s.label === "岗位");
  const countEntry = summary.find((s) => s.label === "要求数量");
  assert.ok(titleEntry, "summary should include 岗位");
  assert.equal(titleEntry?.value, "高级前端工程师");
  assert.ok(countEntry, "summary should include 要求数量");
  assert.equal(countEntry?.value, "3 条");
  assert.equal(summary.find((entry) => entry.label === "来源")?.value, "浏览器页面");
  assert.equal(
    summary.find((entry) => entry.label === "来源 URL")?.value,
    "https://jobs.example/frontend",
  );
});

test("draft preview summary includes 公司 when company is set", () => {
  const draft = createJdSaveApprovalDraft(makeProposal({ company: "字节跳动" }));
  const summary = draft.preview?.summary ?? [];
  const companyEntry = summary.find((s) => s.label === "公司");
  assert.ok(companyEntry, "summary should include 公司 when company is set");
  assert.equal(companyEntry?.value, "字节跳动");
});

test("draft preview summary omits 公司 when company is null", () => {
  const draft = createJdSaveApprovalDraft(makeProposal({ company: null }));
  const summary = draft.preview?.summary ?? [];
  const companyEntry = summary.find((s) => s.label === "公司");
  assert.equal(companyEntry, undefined, "summary should not include 公司 when null");
});

test("draft preview items are mapped from requirements", () => {
  const draft = createJdSaveApprovalDraft(makeProposal({ requirementCount: 2 }));
  const items = draft.preview?.items ?? [];
  assert.equal(items.length, 2);
  assert.equal(items[0]?.title, "要求1");
  assert.equal(items[1]?.title, "要求2");
});

test("draft preview items have 分类 and 重要性 fields", () => {
  const draft = createJdSaveApprovalDraft(makeProposal());
  const fields = draft.preview?.items?.[0]?.fields ?? [];
  const categoryField = fields.find((f) => f.label === "分类");
  const importanceField = fields.find((f) => f.label === "重要性");
  assert.ok(categoryField, "should have 分类 field");
  assert.equal(categoryField?.value, "skill");
  assert.ok(importanceField, "should have 重要性 field");
  assert.equal(importanceField?.value, "high");
});

test("createJdSaveApprovalPayload contains all proposal fields plus idempotencyKey", () => {
  const proposal = makeProposal({ company: "阿里", targetRole: "SRE" });
  const payload = createJdSaveApprovalPayload(proposal, "idem-key-123");
  assert.equal(payload.proposalId, proposal.id);
  assert.equal(payload.title, "高级前端工程师");
  assert.equal(payload.rawText, "原始 JD 文本");
  assert.equal(payload.company, "阿里");
  assert.equal(payload.targetRole, "SRE");
  assert.equal(payload.sourceKind, "browser");
  assert.equal(payload.sourceUrl, "https://jobs.example/frontend");
  assert.equal(payload.idempotencyKey, "idem-key-123");
  assert.equal(payload.requirements.length, 2);
});

test("payload requirements are a deep clone of proposal requirements", () => {
  const proposal = makeProposal();
  const payload = createJdSaveApprovalPayload(proposal, "key");
  // @ts-ignore mutation test
  payload.requirements[0].text = "MUTATED";
  const payload2 = createJdSaveApprovalPayload(proposal, "key");
  assert.equal(payload2.requirements[0]?.text, "要求1");
});
