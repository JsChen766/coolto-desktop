import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { resumeGenerationWasRequested } from
  "../src/desktop/main/jd-continuation.js";

test("latest user request explicitly asks to generate a resume", () => {
  assert.equal(resumeGenerationWasRequested([
    user("请保存这个 JD，并基于它生成一份中文简历", 1),
  ]), true);
  assert.equal(resumeGenerationWasRequested([
    user("请确认这个岗位，然后开始做简历", 1),
  ]), true);
});

test("ordinary JD save and match requests do not announce resume generation", () => {
  assert.equal(resumeGenerationWasRequested([
    user("只保存这个 JD，不要生成简历", 1),
  ]), false);
  assert.equal(resumeGenerationWasRequested([
    user("保存这个 JD 并分析匹配度", 1),
  ]), false);
});

test("only the latest visible user request controls the continuation notice", () => {
  assert.equal(resumeGenerationWasRequested([
    user("为上一个岗位生成简历", 1),
    user("这个新 JD 只保存，不生成简历", 2),
  ]), false);
});

test("a neutral confirmation keeps the preceding resume intent", () => {
  assert.equal(resumeGenerationWasRequested([
    user("保存这个 JD，然后为我生成简历", 1),
    user("确认", 2),
  ]), true);
});

function user(content: string, timestamp: number): AgentMessage {
  return { role: "user", content, timestamp } as AgentMessage;
}
