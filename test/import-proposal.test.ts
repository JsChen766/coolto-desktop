import assert from "node:assert/strict";
import test from "node:test";

import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";
import { createActionApprovalManager } from "../src/actions/create-action-approvals.js";
import { createPrepareExperienceImportTool } from "../src/tools/import-experiences/prepare-import.js";

test("duplicate candidates are unselected by default", () => {
  const store = new ExperienceImportProposalStore();
  const proposal = store.create(
    "text",
    [
      {
        category: "work",
        title: "Existing role",
        content: "Existing content",
      },
      {
        category: "project",
        title: "New project",
        content: "New content",
      },
    ],
    [
      {
        candidateIndex: 0,
        existing: { id: "exp-existing", title: "Existing role" },
      },
    ],
  );

  assert.equal(proposal.candidates[0]?.selected, false);
  assert.equal(
    proposal.candidates[0]?.duplicateOf?.id,
    "exp-existing",
  );
  assert.equal(proposal.candidates[1]?.selected, true);
});

test("composite import only surfaces parsed Profile fields and marks low confidence", async () => {
  const store = new ExperienceImportProposalStore();
  const approvals = createActionApprovalManager({
    experienceWriter: { createExperience: async () => { throw new Error("not expected"); } },
    importProposalStore: store,
  });
  const tool = createPrepareExperienceImportTool(
    { searchExperiences: async () => ({ items: [], nextCursor: null }), getExperience: async () => { throw new Error("not expected"); } },
    { getUserProfile: async () => profile() }, store, approvals,
  );
  await tool.execute("call-1", {
    sourceType: "file", sourceLabel: "Bob Resume.pdf",
    candidates: [{ category: "project", title: "Parser", content: "Parsed from document" }],
    profile: { contactEmail: { value: "resume@example.test", confidence: "low" } },
  }, new AbortController().signal);
  const proposal = store.getActive()!;
  assert.deepEqual(proposal.profileFields, [{
    field: "contactEmail", currentValue: null, proposedValue: "resume@example.test",
    selectedByDefault: true, confidence: "low",
  }]);
  assert.equal(proposal.profileFields.some((field) => field.field === "fullName"), false);
  assert.equal(approvals.listPending()[0]?.preview.profileFields?.[0]?.confidence, "low");
});

function profile() {
  return {
    fullName: "Alice", contactEmail: null, email: "login@example.test", phone: "+852 1234 5678",
    location: null, linkedinUrl: null, githubUrl: null, personalWebsite: null,
    currentTitle: null, currentCompany: null, yearsOfExperience: null, careerStage: null,
    targetRoles: [], targetIndustries: [], targetLocations: [], preferredLanguage: "zh-CN",
    resumeStyle: null,
  };
}
