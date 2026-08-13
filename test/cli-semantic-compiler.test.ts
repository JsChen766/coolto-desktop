import assert from "node:assert/strict";
import test from "node:test";

import { qualifiedChinese } from "../src/resume/fixtures/zh-qualified.js";
import { CliSemanticCompiler } from "../src/cli/semantic-compiler.js";

test("calibrated semantic compiler reproduces real Chromium usage on a generated draft", async () => {
  const compiler = new CliSemanticCompiler();
  const result = await compiler.compile(qualifiedChinese());
  assert.ok(result.qualified, `fixture should pass, got ${JSON.stringify(result.violations.map((v) => v.code))}`);
  assert.ok(result.usageRatio >= 0.92, `usage ${result.usageRatio} should pass the 92% gate`);
  assert.equal(result.bullets.length, 22);
});

test("calibrated semantic compiler flags short drafts and tail violations", async () => {
  const compiler = new CliSemanticCompiler();
  const structure = qualifiedChinese();
  structure.sections.flatMap((section) => section.items).forEach((item) => {
    item.bullets = item.bullets.slice(0, 1);
  });
  const result = await compiler.compile(structure);
  const codes = result.violations.map((violation) => violation.code);
  assert.ok(codes.includes("page_underfilled"), codes.join(","));
});

test("calibrated semantic compiler reports tail lines below the 70% gate", async () => {
  const compiler = new CliSemanticCompiler();
  const structure = qualifiedChinese();
  const firstItem = structure.sections.flatMap((section) => section.items)[0]!;
  firstItem.bullets = [
    {
      id: "tail-bullet",
      text: "测".repeat(4096),
      matched_jd_requirement_ids: [],
    },
  ];
  const result = await compiler.compile(structure);
  const tail = result.violations.find(
    (violation) => violation.code === "bullet_tail_too_short",
  );
  assert.ok(tail, JSON.stringify(result.violations.map((v) => v.code)));
});
