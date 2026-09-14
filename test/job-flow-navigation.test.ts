import assert from "node:assert/strict";
import test from "node:test";

import { buildInterviewQuestionsInstruction, buildJdActionInstruction } from "../src/job-assets/job-action-instruction.js";

test("job actions use product copy without exposing technical IDs", () => {
  const match = buildJdActionInstruction("match", "最终状态回归");
  const generate = buildJdActionInstruction("generate", "最终状态回归");
  const interview = buildInterviewQuestionsInstruction("最终状态回归");
  assert.equal(match, "请为岗位「最终状态回归」匹配经历库，并给出匹配结果。");
  assert.equal(generate, "请为岗位「最终状态回归」生成针对性简历。");
  assert.equal(interview, "请根据我的经历和岗位「最终状态回归」，帮我准备面试问题与作答要点。");
  assert.doesNotMatch(`${match}${generate}${interview}`, /jdId|019fa/i);
});
