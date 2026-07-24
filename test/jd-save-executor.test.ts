import assert from "node:assert/strict";
import test from "node:test";

import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";
import {
  createJdSaveApprovalDraft,
  createJdSaveApprovalPayload,
} from "../src/jd/approval-draft.js";
import { JdProposalStore } from "../src/jd/proposal-store.js";
import type { JdCreateInput, JdRecord, JdWriter } from "../src/api/types.js";

function makeJdRecord(title: string): JdRecord {
  return {
    id: `jd-${title}`,
    title,
    company: null,
    targetRole: null,
    rawText: "raw",
    requirements: [],
    jdHash: "hash-abc",
    requirementMapId: null,
    requirementsOrigin: "extracted",
    sourceThreadId: null,
    createdAt: "2026-07-24T00:00:00Z",
    updatedAt: "2026-07-24T00:00:00Z",
  };
}

function makeProposal(store: JdProposalStore) {
  return store.create(
    "原始 JD 内容",
    "后端工程师",
    "字节跳动",
    null,
    [
      {
        clientId: "req-1",
        text: "3年以上 Go 开发经验",
        category: "experience",
        importance: "high",
        keywords: ["Go"],
        v2Importance: "must_have",
        v2Category: null,
      },
    ],
  );
}

function manager(writer: JdWriter, store: JdProposalStore) {
  return createActionApprovalManager({
    experienceWriter: { createExperience: async () => { throw new Error("not used"); } },
    importProposalStore: new ExperienceImportProposalStore(),
    jdWriter: writer,
    jdProposalStore: store,
  });
}

test("accepted JD approval calls writer exactly once", async () => {
  const store = new JdProposalStore();
  const proposal = makeProposal(store);
  const calls: JdCreateInput[] = [];
  const writer: JdWriter = {
    createJd: async (input) => {
      calls.push(input);
      return makeJdRecord(input.title);
    },
  };
  const approvals = manager(writer, store);
  const request = await approvals.request(
    createJdSaveApprovalDraft(proposal),
    createJdSaveApprovalPayload(proposal, "idem-1"),
  );

  await approvals.resolve(request.id, { type: "accept" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.title, "后端工程师");
});

test("accepted approval passes correct fields to writer", async () => {
  const store = new JdProposalStore();
  const proposal = makeProposal(store);
  let received: JdCreateInput | undefined;
  const writer: JdWriter = {
    createJd: async (input) => {
      received = input;
      return makeJdRecord(input.title);
    },
  };
  const approvals = manager(writer, store);
  const request = await approvals.request(
    createJdSaveApprovalDraft(proposal),
    createJdSaveApprovalPayload(proposal, "idem-1"),
  );

  await approvals.resolve(request.id, { type: "accept" });

  assert.equal(received?.rawText, "原始 JD 内容");
  assert.equal(received?.company, "字节跳动");
  assert.equal(received?.requirements?.[0]?.text, "3年以上 Go 开发经验");
  assert.equal(received?.requirements?.[0]?.importance, "high");
});

test("accepted approval clears proposal store after success", async () => {
  const store = new JdProposalStore();
  const proposal = makeProposal(store);
  const writer: JdWriter = { createJd: async (input) => makeJdRecord(input.title) };
  const approvals = manager(writer, store);
  const request = await approvals.request(
    createJdSaveApprovalDraft(proposal),
    createJdSaveApprovalPayload(proposal, "idem-1"),
  );

  await approvals.resolve(request.id, { type: "accept" });

  assert.equal(store.getActive(), undefined);
});

test("rejected approval calls no writer and clears the proposal", async () => {
  const store = new JdProposalStore();
  const proposal = makeProposal(store);
  let writerCalled = false;
  const writer: JdWriter = {
    createJd: async (input) => {
      writerCalled = true;
      return makeJdRecord(input.title);
    },
  };
  const approvals = manager(writer, store);
  const request = await approvals.request(
    createJdSaveApprovalDraft(proposal),
    createJdSaveApprovalPayload(proposal, "idem-1"),
  );

  await approvals.resolve(request.id, { type: "reject" });

  assert.equal(writerCalled, false);
  assert.equal(store.getActive(), undefined);
});

test("writer network failure does not clear proposal store (retry-safe)", async () => {
  const store = new JdProposalStore();
  const proposal = makeProposal(store);
  const failedEvents: string[] = [];
  const writer: JdWriter = {
    createJd: async () => { throw new Error("network timeout"); },
  };
  const approvals = manager(writer, store);
  approvals.subscribe((event) => {
    if (event.type === "approval.failed") failedEvents.push(event.type);
  });
  const request = await approvals.request(
    createJdSaveApprovalDraft(proposal),
    createJdSaveApprovalPayload(proposal, "idem-1"),
  );

  // ApprovalManager catches executor errors internally and emits approval.failed
  await approvals.resolve(request.id, { type: "accept" });

  assert.equal(failedEvents.length, 1, "should emit approval.failed on writer error");
  assert.ok(store.getActive() !== undefined, "proposal should remain active after failure");
  assert.equal(store.getActive()?.id, proposal.id);
});

test("no writer call before accept", async () => {
  const store = new JdProposalStore();
  const proposal = makeProposal(store);
  let writerCalled = false;
  const writer: JdWriter = {
    createJd: async (input) => {
      writerCalled = true;
      return makeJdRecord(input.title);
    },
  };
  const approvals = manager(writer, store);

  await approvals.request(
    createJdSaveApprovalDraft(proposal),
    createJdSaveApprovalPayload(proposal, "idem-1"),
  );

  assert.equal(writerCalled, false);
});
