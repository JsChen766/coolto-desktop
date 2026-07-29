import assert from "node:assert/strict";
import test from "node:test";

import {
  parseExperienceCreate,
  parseExperienceSearch,
  parseExperienceUpdate,
} from "../src/desktop/main/experience-library/experience-ipc-validation.js";

test("Experience IPC create accepts only Renderer-maintained fields", () => {
  assert.deepEqual(parseExperienceCreate({
    category: "project",
    title: "Editor",
    content: "Built an editor",
    startDate: "2026-07",
    tags: ["Electron"],
  }), {
    category: "project",
    title: "Editor",
    content: "Built an editor",
    startDate: "2026-07",
    tags: ["Electron"],
  });
  assert.throws(
    () => parseExperienceCreate({
      category: "project",
      title: "Editor",
      content: "Built an editor",
      idempotencyKey: "renderer-controlled",
    }),
    /不支持字段/,
  );
});

test("Experience IPC update preserves omitted fields and explicit null", () => {
  const parsed = parseExperienceUpdate({
    experienceId: " exp-1 ",
    changes: { title: "Staff Engineer", location: null },
  });
  assert.equal(parsed.experienceId, "exp-1");
  assert.deepEqual(parsed.changes, {
    title: "Staff Engineer",
    location: null,
  });
  assert.equal(Object.hasOwn(parsed.changes, "organization"), false);
});

test("Experience IPC fails closed on unknown and malformed fields", () => {
  assert.throws(
    () => parseExperienceUpdate({
      experienceId: "exp-1",
      changes: { title: "Engineer", unexpected: true },
    }),
    /不支持字段/,
  );
  assert.throws(
    () => parseExperienceUpdate({
      experienceId: "exp-1",
      changes: { tags: ["valid", 2] },
    }),
    /字符串数组/,
  );
  assert.throws(
    () => parseExperienceSearch({ status: "deleted" }),
    /status 不合法/,
  );
});
