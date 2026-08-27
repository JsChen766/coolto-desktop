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
  assert.match(prompt, /不得声称通过默认严格标准/u);
  assert.match(prompt, /用户要求停止追问时不得继续索取材料/u);
});

test("rejected augmentation tells the agent that unconfirmed content was removed", () => {
  const prompt = buildResumeAugmentationContinuationPrompt(
    "candidate-2",
    "reject",
  );

  assert.match(prompt, /已拒绝并移除/u);
  assert.match(prompt, /只有用户仍要求严格完成且未拒绝追问/u);
  assert.match(prompt, /decline_resume_material/u);
  assert.match(prompt, /不得换一条未经确认的补写/u);
});
