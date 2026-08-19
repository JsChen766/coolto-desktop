import assert from "node:assert/strict";
import test from "node:test";

import { isWrappedInternalPrompt } from "../src/agent/internal-prompt.js";
import { buildResumeAugmentationContinuationPrompt } from "../src/desktop/main/resume-augmentation-continuation.js";

test("accepted augmentation resumes the same workspace and preserves hard gates", () => {
  const prompt = buildResumeAugmentationContinuationPrompt(
    "candidate-1",
    "accept",
  );

  assert.equal(isWrappedInternalPrompt(prompt), true);
  assert.match(prompt, /candidate-1/u);
  assert.match(prompt, /get_resume_workspace/u);
  assert.match(prompt, /ready_for_approval/u);
  assert.match(prompt, /任何 blocker 尚存时不得声称完成/u);
});

test("rejected augmentation tells the agent that unconfirmed content was removed", () => {
  const prompt = buildResumeAugmentationContinuationPrompt(
    "candidate-2",
    "reject",
  );

  assert.match(prompt, /已拒绝并移除/u);
  assert.match(prompt, /真实素材不足时追问用户/u);
  assert.match(prompt, /不得换一条未经确认的补写/u);
});
