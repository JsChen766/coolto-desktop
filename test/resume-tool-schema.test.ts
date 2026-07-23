import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeAlternativeRepairer } from "../src/resume/quality/alternative-repairer.js";
import type { ResumeCandidatePatcher } from "../src/resume/workspace/candidate-patcher.js";
import { createPatchResumeCandidateTool } from "../src/tools/resume-candidate/patch-candidate.js";

function createTool() {
  return createPatchResumeCandidateTool(
    {} as ResumeCandidatePatcher,
    {} as ResumeAlternativeRepairer,
  );
}

test("patch tool exposes a function-calling-compatible object schema", () => {
  const schema = createTool().parameters as {
    type?: string;
    properties?: Record<string, unknown>;
  };

  assert.equal(schema.type, "object");
  assert.ok(schema.properties?.operations);
  assert.ok(schema.properties?.alternativeTargets);
});

test("patch tool rejects ambiguous operation modes before execution", async () => {
  const tool = createTool();
  const execute = tool.execute as (...args: unknown[]) => Promise<unknown>;

  await assert.rejects(
    execute("call-1", { candidateId: "candidate-1", expectedRevision: 0 }),
    /Exactly one/,
  );
  await assert.rejects(
    execute("call-2", {
      candidateId: "candidate-1",
      expectedRevision: 0,
      operations: [],
      alternativeTargets: [],
    }),
    /Exactly one/,
  );
});
