import assert from "node:assert/strict";
import test from "node:test";

import { ExperienceImportProposalStore } from "../src/import/proposal-store.js";

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
