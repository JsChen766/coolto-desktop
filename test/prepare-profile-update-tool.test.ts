import assert from "node:assert/strict";
import test from "node:test";

import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import type { ProfileProposalExecutor } from "../src/profile/types.js";
import type { ResumeContactFields } from "../src/resume/contracts/profile-contact.js";
import { createPrepareProfileUpdateTool } from "../src/tools/prepare-profile-update.js";

test("profile update is prepared for approval and writes only after acceptance", async () => {
  const profile = createProfile();
  const prepared: Array<{ changes: unknown; expected: unknown }> = [];
  const executed: string[] = [];
  const proposals: ProfileProposalExecutor = {
    prepareImport: async (changes, expected) => {
      prepared.push({ changes, expected });
      return {
        id: "profile-proposal-1",
        kind: "import",
        current: contactOf(profile),
        next: { ...contactOf(profile), ...changes },
        syncStatus: "clean",
        preparedAt: "2026-08-13T00:00:00Z",
      };
    },
    execute: async (proposalId) => {
      executed.push(proposalId);
      return null;
    },
  };
  const approvals = createActionApprovalManager({
    experienceWriter: { createExperience: async () => { throw new Error("unused"); } },
    importProposalStore: { clear: () => undefined } as never,
    profileProposals: proposals,
  });
  const tool = createPrepareProfileUpdateTool(
    { getUserProfile: async () => profile },
    proposals,
    approvals,
  );

  await tool.execute("update-profile", {
    fullName: "Alice Zhang",
    phone: "+86 138 0024 6800",
    contactEmail: "alice.zhang@example.com",
  });

  assert.deepEqual(prepared, [{
    changes: {
      fullName: "Alice Zhang",
      phone: "+86 138 0024 6800",
      contactEmail: "alice.zhang@example.com",
    },
    expected: [
      { field: "fullName", currentValue: null, proposedValue: "Alice Zhang", selectedByDefault: true, confidence: "high" },
      { field: "phone", currentValue: null, proposedValue: "+86 138 0024 6800", selectedByDefault: true, confidence: "high" },
      { field: "contactEmail", currentValue: null, proposedValue: "alice.zhang@example.com", selectedByDefault: true, confidence: "high" },
    ],
  }]);
  assert.deepEqual(executed, []);

  const pending = approvals.listPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.actionType, "profile.update");
  assert.equal(pending[0]?.title, "更新个人资料");
  assert.deepEqual(
    pending[0]?.preview.profileFields?.map((field) => ({
      field: field.field,
      currentValue: field.currentValue,
      proposedValue: field.proposedValue,
    })),
    [
      { field: "fullName", currentValue: null, proposedValue: "Alice Zhang" },
      { field: "phone", currentValue: null, proposedValue: "+86 138 0024 6800" },
      { field: "contactEmail", currentValue: null, proposedValue: "alice.zhang@example.com" },
    ],
  );

  await approvals.resolve(pending[0]!.id, { type: "accept" });
  assert.deepEqual(executed, ["profile-proposal-1"]);
});

test("profile update rejects invalid contact values before creating approval", async () => {
  const profile = createProfile();
  let prepared = false;
  const proposals: ProfileProposalExecutor = {
    prepareImport: async () => {
      prepared = true;
      throw new Error("unexpected");
    },
    execute: async () => null,
  };
  const approvals = createActionApprovalManager({
    experienceWriter: { createExperience: async () => { throw new Error("unused"); } },
    importProposalStore: { clear: () => undefined } as never,
    profileProposals: proposals,
  });
  const tool = createPrepareProfileUpdateTool(
    { getUserProfile: async () => profile },
    proposals,
    approvals,
  );

  await assert.rejects(
    tool.execute("invalid-email", { contactEmail: "not-an-email" }),
    /联系邮箱格式无效/,
  );
  assert.equal(prepared, false);
  assert.deepEqual(approvals.listPending(), []);
});

function createProfile() {
  return {
    ...contactOf({}),
    email: "login@example.com",
    currentTitle: null,
    currentCompany: null,
    yearsOfExperience: null,
    careerStage: null,
    targetRoles: [],
    targetIndustries: [],
    targetLocations: [],
    preferredLanguage: "zh-CN",
    resumeStyle: null,
  };
}

function contactOf(values: Partial<ResumeContactFields>): ResumeContactFields {
  return {
    fullName: values.fullName ?? null,
    phone: values.phone ?? null,
    contactEmail: values.contactEmail ?? null,
    location: values.location ?? null,
    linkedinUrl: values.linkedinUrl ?? null,
    githubUrl: values.githubUrl ?? null,
    personalWebsite: values.personalWebsite ?? null,
  };
}
