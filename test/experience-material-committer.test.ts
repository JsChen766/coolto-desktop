import assert from "node:assert/strict";
import test from "node:test";

import type { ExperienceCreateInput, ExperienceDetail } from "../src/api/types.js";
import { LocalExperienceMaterialCommitter } from
  "../src/desktop/main/experience-library/experience-material-committer.js";
import type {
  ExperienceExecutionResult,
  ExperienceWriteProposal,
} from "../src/experience/maintenance-types.js";

test("one material appends one text block through one Experience proposal", async () => {
  const current = experience("原有经历正文。", 3);
  const proposals = new MemoryProposals(current);
  const committer = new LocalExperienceMaterialCommitter({
    searchExperiences: async () => ({ items: [], nextCursor: null }),
    getExperience: async () => current,
  }, proposals);
  const input = {
    target: { kind: "existing" as const, experienceId: current.id },
    sourceHash: "a".repeat(64), sourceLabel: "report.pdf",
    capturedAt: "2026-08-30T00:00:00Z",
    numberCount: 1, criticalOutputCount: 2,
    sections: [{ label: "第 1 页", text: "完成 10 页报告并输出投资建议。" }],
  };
  const result = await committer.commit(input);

  assert.equal(result.created, false);
  assert.equal(proposals.updates.length, 1);
  assert.match(proposals.updates[0]!.content ?? "", /原有经历正文/u);
  assert.match(proposals.updates[0]!.content ?? "", /完成 10 页报告/u);
  assert.match(proposals.updates[0]!.content ?? "", /材料指纹/u);
  assert.equal(proposals.updates[0]!.revisionSource, "import");

  const repeated = await committer.commit(input);
  assert.equal(repeated.duplicate, true);
  assert.equal(proposals.updates.length, 1);
});

test("unmatched material automatically creates one text-based Experience", async () => {
  const proposals = new MemoryProposals(experience("unused", 1));
  const committer = new LocalExperienceMaterialCommitter({
    searchExperiences: async () => ({ items: [], nextCursor: null }),
    getExperience: async () => { throw new Error("not expected"); },
  }, proposals);
  const result = await committer.commit({
    target: { kind: "new", category: "project", title: "行业研究报告",
      organization: null, role: null, location: null,
      startDate: null, endDate: null, tags: ["研究"] },
    sourceHash: "b".repeat(64), sourceLabel: "report.pdf",
    capturedAt: "2026-08-30T00:00:00Z",
    numberCount: 0, criticalOutputCount: 2,
    sections: [{ label: "第 1 页", text: "完成报告并输出分析结论。" }],
  });
  assert.equal(result.created, true);
  assert.equal(proposals.creates.length, 1);
  assert.equal(proposals.creates[0]?.revisionSource, "import");
  assert.match(proposals.creates[0]?.content ?? "", /分析结论/u);
});

test("automatic material merge refuses to overwrite a concurrently changed body", async () => {
  const readVersion = experience("读取时的正文", 1);
  const proposals = new MemoryProposals(experience("并发更新后的正文", 2));
  const committer = new LocalExperienceMaterialCommitter({
    searchExperiences: async () => ({ items: [], nextCursor: null }),
    getExperience: async () => readVersion,
  }, proposals);
  await assert.rejects(committer.commit({
    target: { kind: "existing", experienceId: readVersion.id },
    sourceHash: "c".repeat(64), sourceLabel: "report.pdf",
    capturedAt: "2026-08-30T00:00:00Z",
    numberCount: 0, criticalOutputCount: 1,
    sections: [{ label: "第 1 页", text: "交付分析报告。" }],
  }), /正文已变化/u);
  assert.deepEqual(proposals.discarded, ["proposal-1"]);
});

class MemoryProposals {
  updates: Array<{ content?: string; revisionSource?: string }> = [];
  creates: ExperienceCreateInput[] = [];
  discarded: string[] = [];
  constructor(private readonly current: ExperienceDetail) {}
  async prepareCreate(input: ExperienceCreateInput): Promise<ExperienceWriteProposal> {
    this.creates.push(input);
    return { ...proposal(this.current), kind: "create", current: null };
  }
  async prepareUpdate(_id: string, changes: { content?: string; revisionSource?: string }) {
    this.updates.push(changes);
    return { ...proposal(this.current), current: snapshot(this.current) };
  }
  execute(): ExperienceExecutionResult {
    if (this.creates.length) {
      const input = this.creates.at(-1)!;
      const created = experience(input.content, 0);
      created.id = "created-experience";
      created.title = input.title;
      return { experience: created, removedLocal: false };
    }
    const latest = this.updates.at(-1)?.content;
    if (latest && this.current.currentRevision) this.current.currentRevision.content = latest;
    return { experience: this.current, removedLocal: false };
  }
  discard(id: string): void { this.discarded.push(id); }
}

function proposal(value: ExperienceDetail): ExperienceWriteProposal {
  return {
    id: "proposal-1", kind: "update", experienceId: value.id,
    expectedEntityVersion: value.entityVersion, expectedLocalVersion: 1,
    current: null, next: null, errorCode: null, preparedAt: "2026-08-30T00:00:00Z",
  };
}

function snapshot(value: ExperienceDetail) {
  return {
    id: value.id, category: value.category, title: value.title,
    content: value.currentRevision?.content ?? "", organization: value.organization,
    role: value.role, location: value.location, startDate: value.startDate,
    endDate: value.endDate, tags: value.tags, resumeSectionKey: null,
    resumeSectionLabel: null, status: value.status,
    revisionId: value.currentRevisionId ?? "revision-1",
    revisionHash: value.currentRevision?.revisionHash ?? "hash",
  };
}

function experience(content: string, version: number): ExperienceDetail {
  return {
    id: "019d0000-0000-7000-8000-000000000001", category: "work",
    title: "战略投资实习生", organization: "Example", role: null, location: null,
    startDate: null, endDate: null, tags: [], status: "active",
    currentRevisionId: "revision-1", currentRevision: {
      id: "revision-1", experienceId: "019d0000-0000-7000-8000-000000000001",
      content, source: "manual", revisionHash: "hash", factBankStatus: "not_applicable",
      createdAt: "2026-08-01T00:00:00Z",
    }, revisions: [], createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z", entityVersion: version,
    deletedAt: null, syncStatus: "clean",
  };
}
