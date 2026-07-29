import assert from "node:assert/strict";
import test from "node:test";

import type { ExperienceDetail } from "../src/api/types.js";
import {
  draftFromExperience,
  emptyExperienceDraft,
  experienceFormErrors,
  normalizeExperienceTags,
  sameExperienceDraft,
  toExperienceCreateInput,
  toExperienceUpdateInput,
} from "../src/desktop/renderer/src/experiences/experience-form.js";

test("experience form preserves empty, month, day and present date semantics", () => {
  const month = draftFromExperience(detail({
    startDate: "2024-03",
    endDate: "present",
  }));
  assert.equal(month.startMode, "month");
  assert.equal(month.startValue, "2024-03");
  assert.equal(month.endMode, "present");
  assert.deepEqual(toExperienceUpdateInput(month), {
    category: "work",
    title: "Engineer",
    content: "Built sync",
    organization: null,
    role: null,
    location: null,
    startDate: "2024-03",
    endDate: "present",
    tags: [],
    status: "active",
  });

  month.startMode = "day";
  month.startValue = "2024-03-18";
  month.endMode = "none";
  assert.equal(toExperienceUpdateInput(month).startDate, "2024-03-18");
  assert.equal(toExperienceUpdateInput(month).endDate, null);
});

test("create omits empty optional values while update explicitly clears them", () => {
  const draft = {
    ...emptyExperienceDraft(),
    title: "Project",
    content: "Built an editor",
  };
  assert.deepEqual(toExperienceCreateInput(draft), {
    category: "work",
    title: "Project",
    content: "Built an editor",
    tags: [],
  });
  assert.equal(toExperienceUpdateInput(draft).organization, null);
  assert.equal(toExperienceUpdateInput(draft).endDate, null);
});

test("tags use NFKC trim and case-insensitive deduplication", () => {
  assert.deepEqual(
    normalizeExperienceTags([" Vue ", "SYNC"], "ｖｕｅ， Electron, sync"),
    ["Vue", "SYNC", "Electron"],
  );
});

test("form validation reports fields and dirty comparison uses normalized payload", () => {
  const draft = emptyExperienceDraft();
  draft.startMode = "month";
  draft.startValue = "";
  const errors = experienceFormErrors(draft);
  assert.match(errors.title ?? "", /标题/);
  assert.match(errors.content ?? "", /正文/);
  assert.match(errors.startDate ?? "", /日期/);

  const baseline = {
    ...emptyExperienceDraft(),
    title: "Project",
    content: "Content",
  };
  assert.equal(sameExperienceDraft(baseline, { ...baseline, title: " Project " }), true);
  assert.equal(sameExperienceDraft(baseline, { ...baseline, location: "HK" }), false);
});

function detail(overrides: Partial<ExperienceDetail>): ExperienceDetail {
  return {
    id: "exp-1",
    category: "work",
    title: "Engineer",
    organization: null,
    role: null,
    location: null,
    startDate: null,
    endDate: null,
    tags: [],
    status: "active",
    currentRevisionId: "rev-1",
    currentRevision: {
      id: "rev-1",
      experienceId: "exp-1",
      content: "Built sync",
      source: "manual",
      revisionHash: "hash",
      factBankStatus: "not_applicable",
      createdAt: "2026-07-29T00:00:00.000Z",
    },
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    entityVersion: 1,
    deletedAt: null,
    syncStatus: "clean",
    revisions: [],
    ...overrides,
  };
}
