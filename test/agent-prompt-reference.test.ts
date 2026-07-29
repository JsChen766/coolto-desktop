import assert from "node:assert/strict";
import test from "node:test";

import { promptWithResumeReference } from "../src/desktop/main/agent-prompt-reference.js";

test("local Resume reference restores its editable draft", () => {
  const prompt = promptWithResumeReference("修改标题", {
    artifactId: "draft-1",
    targetType: "resume",
    targetId: "draft-1",
    label: "本地简历",
    source: "local",
  });

  assert.match(prompt, /artifact_id: draft-1/);
  assert.match(prompt, /stable target ID/);
  assert.doesNotMatch(prompt, /source: cloud/);
});

test("cloud Resume reference is read-only until copy creation is confirmed", () => {
  const readOnly = promptWithResumeReference("分析优缺点", {
    artifactId: "cloud:resume-1",
    targetType: "resume",
    targetId: "resume-1",
    label: "云端简历",
    source: "cloud",
    resumeId: "resume-1",
    contentHash: "hash-1",
    operationMode: "read_only",
  });
  const createCopy = promptWithResumeReference("创建工作副本", {
    artifactId: "cloud:resume-1",
    targetType: "resume",
    targetId: "resume-1",
    label: "云端简历",
    source: "cloud",
    resumeId: "resume-1",
    contentHash: "hash-1",
    operationMode: "create_local_copy",
  });

  assert.match(readOnly, /operation_mode: read_only/);
  assert.match(readOnly, /do not create a candidate/);
  assert.match(createCopy, /explicitly confirmed/);
  assert.match(createCopy, /Never overwrite the cloud Resume/);
});
