import assert from "node:assert/strict";
import test from "node:test";

import { createResumeGenerationFollowUp } from
  "../src/desktop/main/resume-generation-follow-up.js";
import { createResumeInteractionStop } from
  "../src/desktop/main/resume-interaction-stop.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

test("material questions never queue an automatic resume follow-up", async () => {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(),
    new FixtureResumeCompiler(),
    store,
  );
  await create.execute("insufficient-material", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  });

  assert.equal(createResumeGenerationFollowUp(store)(1), undefined);
  const shouldStop = createResumeInteractionStop(store);
  assert.equal(shouldStop({ toolResults: [] } as never), true);
  assert.equal(shouldStop({ toolResults: [{}] } as never), false);
});
