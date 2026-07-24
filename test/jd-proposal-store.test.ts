import assert from "node:assert/strict";
import test from "node:test";

import { JdProposalStore } from "../src/jd/proposal-store.js";

const sampleReqs = [
  {
    clientId: "req-1",
    text: "5年以上前端经验",
    category: "experience",
    importance: "high" as const,
    keywords: ["前端", "React"],
    v2Importance: "must_have" as const,
    v2Category: null,
  },
];

test("create returns proposal with jd-proposal- prefix ID", () => {
  const store = new JdProposalStore();
  const p = store.create("raw text", "高级前端工程师", "字节跳动", null, sampleReqs);
  assert.ok(p.id.startsWith("jd-proposal-"), `ID should have prefix, got: ${p.id}`);
});

test("create sets all fields and duplicateStatus=none", () => {
  const store = new JdProposalStore();
  const p = store.create("some jd text", "后端工程师", "阿里", "SRE", sampleReqs);
  assert.equal(p.title, "后端工程师");
  assert.equal(p.company, "阿里");
  assert.equal(p.targetRole, "SRE");
  assert.equal(p.rawText, "some jd text");
  assert.equal(p.duplicateStatus, "none");
  assert.equal(p.requirements.length, 1);
});

test("create returns an immutable clone — mutating result does not affect store", () => {
  const store = new JdProposalStore();
  const p = store.create("text", "岗位A", null, null, sampleReqs);
  const originalTitle = p.title;
  // @ts-ignore intentional mutation test
  p.title = "MUTATED";
  const retrieved = store.getActive();
  assert.equal(retrieved?.title, originalTitle);
});

test("requirements are deep-cloned — mutating input does not affect stored proposal", () => {
  const reqs = structuredClone(sampleReqs);
  const store = new JdProposalStore();
  store.create("text", "岗位", null, null, reqs);
  reqs[0]!.text = "MUTATED";
  const active = store.getActive();
  assert.equal(active?.requirements[0]?.text, "5年以上前端经验");
});

test("getActive returns undefined when no proposal exists", () => {
  const store = new JdProposalStore();
  assert.equal(store.getActive(), undefined);
});

test("getActive returns the active proposal after create", () => {
  const store = new JdProposalStore();
  const created = store.create("text", "岗位", null, null, sampleReqs);
  const active = store.getActive();
  assert.equal(active?.id, created.id);
});

test("get returns the proposal by ID", () => {
  const store = new JdProposalStore();
  const created = store.create("text", "岗位", null, null, sampleReqs);
  const fetched = store.get(created.id);
  assert.equal(fetched.id, created.id);
  assert.equal(fetched.title, "岗位");
});

test("get throws for unknown ID", () => {
  const store = new JdProposalStore();
  assert.throws(() => store.get("nonexistent-id"), /不存在|失效/);
});

test("get throws for wrong ID when a different proposal is active", () => {
  const store = new JdProposalStore();
  store.create("text", "岗位", null, null, sampleReqs);
  assert.throws(() => store.get("wrong-id"), /不存在|失效/);
});

test("clear removes the active proposal", () => {
  const store = new JdProposalStore();
  const p = store.create("text", "岗位", null, null, sampleReqs);
  store.clear(p.id);
  assert.equal(store.getActive(), undefined);
});

test("clear with a different ID is a no-op", () => {
  const store = new JdProposalStore();
  const p = store.create("text", "岗位", null, null, sampleReqs);
  store.clear("other-id");
  assert.ok(store.getActive() !== undefined, "proposal should still be active");
  assert.equal(store.getActive()?.id, p.id);
});

test("second create replaces the first and generates a new ID", () => {
  const store = new JdProposalStore();
  const first = store.create("text1", "岗位1", null, null, sampleReqs);
  const second = store.create("text2", "岗位2", null, null, sampleReqs);
  assert.notEqual(first.id, second.id);
  assert.equal(store.getActive()?.id, second.id);
  assert.throws(() => store.get(first.id), /不存在|失效/);
});
