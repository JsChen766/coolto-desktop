import assert from "node:assert/strict";
import test from "node:test";

import { StreamingOutputRepetitionGuard } from "../src/agent/output-repetition-guard.js";

test("streaming output guard stops an exact long-form repetition", () => {
  const guard = new StreamingOutputRepetitionGuard();
  const repeated =
    "宿主要求数字逐字匹配证据原文，因此当前改写仍然会被拒绝。" +
    "我需要停止重复同一判断，保留当前最佳结果并向用户说明证据限制。" +
    "这一段足够长，用于模拟真实模型在单次流式输出中反复生成同一组推理。";
  const output = `${repeated}\n${repeated}\n${repeated}\n${repeated}\n`;

  let detected = false;
  for (let offset = 0; offset < output.length; offset += 37) {
    detected = guard.append(output.slice(offset, offset + 37)) || detected;
  }

  assert.equal(detected, true);
});

test("streaming output guard allows long non-repeating content", () => {
  const guard = new StreamingOutputRepetitionGuard();
  const sections = Array.from(
    { length: 80 },
    (_, index) =>
      `第 ${index + 1} 项经历包含不同的职责、结果和证据编号 ${index * 17 + 3}，` +
      `需要分别判断与目标岗位的相关性和版面优先级。`,
  );

  assert.equal(guard.append(sections.join("\n")), false);
});

test("streaming output guard stops runaway unique narration before a tool call", () => {
  const guard = new StreamingOutputRepetitionGuard();
  const narration = Array.from(
    { length: 180 },
    (_, index) =>
      `第 ${index + 1} 次重新规划仍在展开不同措辞，但没有产生工具调用或用户结论 ${index * 31 + 7}`,
  ).join("\n");

  assert.equal(guard.append(narration), true);
});
