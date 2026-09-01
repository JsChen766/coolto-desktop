import assert from "node:assert/strict";
import test from "node:test";

import { createExperienceMaintenanceExecutor } from
  "../src/actions/experience-maintenance-executor.js";
import { createActionApprovalManager } from
  "../src/actions/create-action-approvals.js";
import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";
import { ActionExecutorRegistry } from "../src/approvals/executor-registry.js";
import {
  EXPERIENCE_MAINTENANCE_ACTION_TYPE,
} from "../src/experience/maintenance-approval.js";
import type { ExperienceWriteProposal } from
  "../src/experience/maintenance-types.js";
import type { ExperienceCreateInput, ExperienceUpdateInput } from
  "../src/api/types.js";
import { createPrepareExperienceMaintenanceTool } from
  "../src/tools/prepare-experience-maintenance.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";

test("one correction approval can update and create a split education record", async () => {
  const proposals = new FakeProposals();
  const manager = approvals(proposals);
  const tool = createPrepareExperienceMaintenanceTool(proposals, manager);
  const result = await tool.execute("split", { operations: [
    updateOperation("A University", "2016-09", "2020-06", "exp-current"),
    createOperation("B University", "2020-09", "2022-06"),
  ] });

  assert.equal((result.details as { operationCount: number }).operationCount, 2);
  assert.equal(manager.listPending().length, 1);
  assert.equal(proposals.executed.length, 0);
  await manager.resolve(manager.listPending()[0]!.id, { type: "accept" });
  assert.deepEqual(proposals.executed, ["proposal-1", "proposal-2"]);
  assert.deepEqual(proposals.batches, [["proposal-1", "proposal-2"]]);
  assert.equal(proposals.updated[0]?.changes.revisionSource, "app_generated");
  assert.equal(proposals.created[0]?.title, "B University");
});

test("rejecting an Experience correction discards every prepared proposal", async () => {
  const proposals = new FakeProposals();
  const manager = approvals(proposals);
  const tool = createPrepareExperienceMaintenanceTool(proposals, manager);
  await tool.execute("reject", { operations: [
    updateOperation("A University", "2016-09", "2020-06", "exp-current"),
    createOperation("B University", "2020-09", "2022-06"),
  ] });
  await manager.resolve(manager.listPending()[0]!.id, { type: "reject" });
  assert.deepEqual(proposals.discarded, ["proposal-1", "proposal-2"]);
  assert.equal(proposals.executed.length, 0);
});

test("the desktop approval manager registers the Experience correction executor", async () => {
  const proposals = new FakeProposals();
  const prepared = await proposals.prepareUpdate("exp-current", {
    category: "education", title: "A University", content: "Correct education",
  });
  const manager = createActionApprovalManager({
    experienceWriter: { createExperience: async () => { throw new Error("unused"); } },
    importProposalStore: new ExperienceImportProposalStore(),
    resumeExperienceSyncProposals: proposals,
  });
  await manager.request({
    actionType: EXPERIENCE_MAINTENANCE_ACTION_TYPE,
    scopeKey: "test", risk: "write", title: "test", description: "test",
    preview: { summary: [] },
  }, { proposalIds: [prepared.id] });
  await manager.resolve(manager.listPending()[0]!.id, { type: "accept" });
  assert.deepEqual(proposals.batches, [[prepared.id]]);
});

test("one correction batch cannot update the same Experience twice", async () => {
  const proposals = new FakeProposals();
  const tool = createPrepareExperienceMaintenanceTool(proposals, approvals(proposals));
  await assert.rejects(tool.execute("duplicate", { operations: [
    updateOperation("A University", "2016-09", "2020-06", "exp-current"),
    updateOperation("A University", "2016-09", "2020-06", "exp-current"),
  ] }), /不能重复更新/u);
  assert.equal(proposals.updated.length, 0);
});

function approvals(proposals: FakeProposals): ApprovalManager {
  const executors = new ActionExecutorRegistry();
  executors.register(EXPERIENCE_MAINTENANCE_ACTION_TYPE,
    createExperienceMaintenanceExecutor(proposals));
  return new ApprovalManager(new ApprovalStore(), executors);
}

function fields(
  title: string,
  startDate: string,
  endDate: string,
) {
  return {
    category: "education" as const, title, content: `${title} education`,
    organization: "Computer Science", role: "Degree", location: null,
    startDate, endDate, tags: [], resumeSection: null,
  };
}

function createOperation(title: string, startDate: string, endDate: string) {
  return { kind: "create" as const, ...fields(title, startDate, endDate) };
}

function updateOperation(
  title: string,
  startDate: string,
  endDate: string,
  experienceId: string,
) {
  return { kind: "update" as const, experienceId, ...fields(title, startDate, endDate) };
}

class FakeProposals {
  created: ExperienceCreateInput[] = [];
  updated: Array<{ id: string; changes: ExperienceUpdateInput }> = [];
  executed: string[] = [];
  discarded: string[] = [];
  batches: string[][] = [];

  async prepareCreate(input: ExperienceCreateInput): Promise<ExperienceWriteProposal> {
    this.created.push(input);
    return proposal(`proposal-${this.created.length + this.updated.length}`, "create", input);
  }

  async prepareUpdate(
    id: string,
    changes: ExperienceUpdateInput,
  ): Promise<ExperienceWriteProposal> {
    this.updated.push({ id, changes });
    return proposal(`proposal-${this.created.length + this.updated.length}`, "update", {
      category: changes.category!, title: changes.title!, content: changes.content!,
      ...(changes.organization ? { organization: changes.organization } : {}),
      ...(changes.role ? { role: changes.role } : {}),
      ...(changes.location ? { location: changes.location } : {}),
      ...(changes.startDate ? { startDate: changes.startDate } : {}),
      ...(changes.endDate ? { endDate: changes.endDate } : {}),
      ...(changes.tags ? { tags: changes.tags } : {}),
    });
  }

  execute(id: string): void { this.executed.push(id); }
  executeMany(ids: readonly string[]): unknown[] {
    this.batches.push([...ids]);
    this.executed.push(...ids);
    return ids.map(() => undefined);
  }
  discard(id: string): void { this.discarded.push(id); }
}

function proposal(
  id: string,
  kind: "create" | "update",
  input: ExperienceCreateInput,
): ExperienceWriteProposal {
  return {
    id, kind, experienceId: kind === "create" ? `new-${id}` : "exp-current",
    expectedEntityVersion: kind === "create" ? null : 1,
    expectedLocalVersion: kind === "create" ? null : 1,
    current: kind === "create" ? null : snapshot("Merged education"),
    next: snapshot(input.title, input), errorCode: null,
    preparedAt: "2026-09-01T00:00:00.000Z",
  };
}

function snapshot(title: string, input?: ExperienceCreateInput) {
  return {
    id: `snapshot-${title}`, category: input?.category ?? "education" as const,
    title, content: input?.content ?? "Two education records", organization: input?.organization ?? null,
    role: input?.role ?? null, location: input?.location ?? null,
    startDate: input?.startDate ?? null, endDate: input?.endDate ?? null,
    tags: input?.tags ?? [], resumeSectionKey: null, resumeSectionLabel: null,
    status: "active" as const, revisionId: `revision-${title}`, revisionHash: `hash-${title}`,
  };
}
