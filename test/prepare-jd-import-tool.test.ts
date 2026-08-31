import assert from "node:assert/strict";
import test from "node:test";

import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";
import { JdProposalStore } from "../src/jd/proposal-store.js";
import { createPrepareJdImportTool } from "../src/tools/prepare-jd-import.js";

const sampleParams = {
  rawText: "我们正在寻找一名高级前端工程师，要求5年以上 React 开发经验，精通 TypeScript。",
  title: "高级前端工程师",
  company: "字节跳动",
  sourceKind: "browser" as const,
  sourceUrl: "https://jobs.example/frontend",
  requirements: [
    {
      text: "5年以上 React 开发经验",
      category: "experience",
      importance: "high" as const,
      keywords: ["React", "前端"],
      v2Importance: "must_have" as const,
    },
    {
      text: "精通 TypeScript",
      category: "skill",
      importance: "high" as const,
      keywords: ["TypeScript"],
    },
  ],
};

function makeApprovalManager(jdProposalStore: JdProposalStore) {
  return createActionApprovalManager({
    experienceWriter: { createExperience: async () => { throw new Error("not used"); } },
    importProposalStore: new ExperienceImportProposalStore(),
    jdWriter: { createJd: async () => { throw new Error("not used"); } },
    jdProposalStore,
  });
}

test("tool creates a proposal in the store", async () => {
  const store = new JdProposalStore();
  const approvals = makeApprovalManager(store);
  const tool = createPrepareJdImportTool(store, approvals);

  await tool.execute("call-1", sampleParams);

  assert.ok(store.getActive() !== undefined, "proposal should be active after tool call");
  assert.equal(store.getActive()?.title, "高级前端工程师");
  assert.equal(store.getActive()?.company, "字节跳动");
  assert.equal(store.getActive()?.sourceKind, "browser");
  assert.equal(store.getActive()?.sourceUrl, "https://jobs.example/frontend");
});

test("tool sets duplicateStatus to 'none'", async () => {
  const store = new JdProposalStore();
  const approvals = makeApprovalManager(store);
  const tool = createPrepareJdImportTool(store, approvals);

  await tool.execute("call-1", sampleParams);

  assert.equal(store.getActive()?.duplicateStatus, "none");
});

test("tool issues exactly one pending approval", async () => {
  const store = new JdProposalStore();
  const approvals = makeApprovalManager(store);
  const tool = createPrepareJdImportTool(store, approvals);

  await tool.execute("call-1", sampleParams);

  assert.equal(approvals.listPending().length, 1);
  assert.equal(approvals.listPending()[0]?.actionType, "jd.save");
});

test("tool result contains proposalId and approvalRequestId", async () => {
  const store = new JdProposalStore();
  const approvals = makeApprovalManager(store);
  const tool = createPrepareJdImportTool(store, approvals);

  const result = await tool.execute("call-1", sampleParams);

  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  const summary = JSON.parse(text) as {
    proposalId: string;
    approvalRequestId: string;
    requirementsCount: number;
  };
  assert.ok(summary.proposalId.startsWith("jd-proposal-"), `proposalId: ${summary.proposalId}`);
  assert.ok(summary.approvalRequestId.length > 0);
  assert.equal(summary.requirementsCount, 2);
});

test("requirements are mapped with sequential clientIds", async () => {
  const store = new JdProposalStore();
  const approvals = makeApprovalManager(store);
  const tool = createPrepareJdImportTool(store, approvals);

  await tool.execute("call-1", sampleParams);

  const reqs = store.getActive()?.requirements ?? [];
  assert.equal(reqs[0]?.clientId, "req-1");
  assert.equal(reqs[1]?.clientId, "req-2");
});

test("optional v2Importance and company are set correctly", async () => {
  const store = new JdProposalStore();
  const approvals = makeApprovalManager(store);
  const tool = createPrepareJdImportTool(store, approvals);

  await tool.execute("call-1", sampleParams);

  const reqs = store.getActive()?.requirements ?? [];
  assert.equal(reqs[0]?.v2Importance, "must_have");
  assert.equal(reqs[1]?.v2Importance, null);
});

test("second tool call replaces first proposal", async () => {
  const store = new JdProposalStore();
  const approvals = makeApprovalManager(store);
  const tool = createPrepareJdImportTool(store, approvals);

  await tool.execute("call-1", sampleParams);
  const firstId = store.getActive()?.id;

  await tool.execute("call-2", { ...sampleParams, title: "产品经理" });
  const secondId = store.getActive()?.id;

  assert.notEqual(firstId, secondId);
  assert.equal(store.getActive()?.title, "产品经理");
});

test("tool omits company from proposal when not provided", async () => {
  const store = new JdProposalStore();
  const approvals = makeApprovalManager(store);
  const tool = createPrepareJdImportTool(store, approvals);
  const { company: _company, ...paramsWithoutCompany } = sampleParams;

  await tool.execute("call-1", paramsWithoutCompany);

  assert.equal(store.getActive()?.company, null);
});

test("tool rejects credential-bearing source URLs", async () => {
  const store = new JdProposalStore();
  const tool = createPrepareJdImportTool(store, makeApprovalManager(store));

  await assert.rejects(
    tool.execute("call-url", {
      ...sampleParams,
      sourceUrl: "https://user:secret@jobs.example/frontend",
    }),
    /不能包含用户名或密码/u,
  );
  assert.equal(store.getActive(), undefined);
});
