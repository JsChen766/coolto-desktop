import assert from "node:assert/strict";
import test from "node:test";

import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import type {
  ExperienceCreateInput,
  ExperienceDetail,
} from "../src/api/types.js";
import {
  createExperienceImportApprovalDraft,
  createExperienceImportApprovalPayload,
} from "../src/import/approval-draft.js";
import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";

test("partial import creates a new approval only for failed candidates", async () => {
  const store = new ExperienceImportProposalStore();
  const proposal = store.create(
    "text",
    [
      {
        category: "project",
        title: "Succeeds",
        content: "Saved content",
      },
      {
        category: "project",
        title: "Fails",
        content: "Retry content",
      },
    ],
    [],
  );
  const writer = {
    createExperience: async (input: ExperienceCreateInput) => {
      if (input.title === "Fails") {
        throw new Error("temporary failure");
      }
      return createDetail(input.title);
    },
  };
  const approvals = createActionApprovalManager({ experienceWriter: writer, importProposalStore: store });
  const request = await approvals.request(
    createExperienceImportApprovalDraft(proposal),
    createExperienceImportApprovalPayload(proposal),
  );

  await approvals.resolve(request.id, { type: "accept" });

  const retry = approvals.listPending();
  assert.equal(retry.length, 1);
  assert.equal(retry[0]?.title, "写入 1 条经历");
  const active = store.get(proposal.id);
  assert.ok(active.candidates[0]?.savedExperienceId);
  assert.equal(active.candidates[1]?.savedExperienceId, undefined);
});

function createDetail(title: string): ExperienceDetail {
  return {
    id: `exp-${title}`,
    category: "project",
    title,
    organization: null,
    role: null,
    location: null,
    startDate: null,
    endDate: null,
    tags: [],
    status: "active",
    currentRevisionId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    revisions: [],
  };
}
