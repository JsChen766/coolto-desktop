import assert from "node:assert/strict";
import test from "node:test";

import type { ExperienceSummary } from "../src/api/types.js";
import {
  mergeFocusedExperiences,
  nextFocusedExperienceId,
  uniqueExperienceIds,
} from "../src/desktop/renderer/src/experiences/experience-import-focus.js";

test("focus injects exact assets missing from the loaded catalog", () => {
  const merged = mergeFocusedExperiences(
    [experience("catalog", "Catalog")],
    [experience("outside-page", "Imported")],
  );
  assert.deepEqual(merged.map((item) => item.id), ["catalog", "outside-page"]);
  assert.equal(
    mergeFocusedExperiences(merged, [experience("catalog", "Fresh")])[0]?.title,
    "Fresh",
  );
});

test("focus order is stable, unique and wraps in both directions", () => {
  const ids = uniqueExperienceIds([" exp-1 ", "exp-2", "exp-1", ""]);
  assert.deepEqual(ids, ["exp-1", "exp-2"]);
  assert.equal(nextFocusedExperienceId(ids, "exp-1", 1), "exp-2");
  assert.equal(nextFocusedExperienceId(ids, "exp-2", 1), "exp-1");
  assert.equal(nextFocusedExperienceId(ids, "exp-1", -1), "exp-2");
});

function experience(id: string, title: string): ExperienceSummary {
  return {
    id,
    title,
    category: "project",
    organization: null,
    role: null,
    location: null,
    startDate: null,
    endDate: null,
    tags: [],
    status: "active",
    currentRevisionId: null,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    entityVersion: 1,
    deletedAt: null,
    syncStatus: "clean",
  };
}
