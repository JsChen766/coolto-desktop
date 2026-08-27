import assert from "node:assert/strict";
import test from "node:test";

import { createResumeGenerationFollowUp } from
  "../src/desktop/main/resume-generation-follow-up.js";
import { createResumeInteractionStop } from
  "../src/desktop/main/resume-interaction-stop.js";
import { resumeAgentNextAction } from
  "../src/resume/workspace/agent-next-action.js";
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

  const action = resumeAgentNextAction(store.latest()!);
  const question = action.mode === "request_more_material" ? action.question! : "";
  const assistant = {
    role: "assistant",
    content: [{ type: "text", text: question }],
    timestamp: 1,
  } as never;
  assert.equal(createResumeGenerationFollowUp(store)(1, assistant), undefined);
  const shouldStop = createResumeInteractionStop(store);
  assert.equal(shouldStop({ toolResults: [], message: assistant } as never), true);
  const stoppedAssistant = {
    role: "assistant",
    content: [{ type: "text", text: "已停止。" }],
    timestamp: 2,
  } as never;
  assert.equal(shouldStop({
    toolResults: [],
    message: stoppedAssistant,
  } as never), false);
  assert.equal(shouldStop({ toolResults: [{}] } as never), false);
});

test("a text-only stop at an existing material boundary requires one resolution tool", async () => {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), new FixtureResumeCompiler(), store,
  );
  await create.execute("insufficient-material", {
    jdId: "jd-1", language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  });
  const userTimestamp = Date.now() + 1_000;
  const followUp = createResumeGenerationFollowUp(store, () => userTimestamp)(
    2,
    { role: "assistant", content: [{ type: "text", text: "已停止。" }],
      timestamp: userTimestamp } as never,
  );
  assert.equal(typeof followUp, "object");
  assert.equal(typeof followUp === "object" && followUp?.requireToolCall, true);
  assert.match(typeof followUp === "object" ? followUp.instruction : "", /decline_resume_material/u);
});
