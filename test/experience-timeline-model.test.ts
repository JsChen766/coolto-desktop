import assert from "node:assert/strict";
import test from "node:test";

import type { ExperienceSummary } from "../src/api/types.js";
import {
  filterExperienceCatalog,
  groupExperienceTimeline,
  experienceMatchContext,
} from "../src/experience/timeline-model.js";
import {
  experienceDateRange,
} from "../src/experience/timeline-labels.js";
import {
  highlightExperienceText,
} from "../src/experience/text-highlight.js";

test("experience timeline groups once by end year and keeps missing dates last", () => {
  const groups = groupExperienceTimeline([
    experience("missing", { endDate: null, startDate: "2025-01" }),
    experience("past", { endDate: "2024-06", startDate: "2022-01" }),
    experience("present", { endDate: "present", startDate: "2023-03" }),
  ]);

  assert.deepEqual(groups.map((group) => group.label), [
    "至今",
    "2024",
    "日期待补充",
  ]);
  assert.deepEqual(groups.flatMap((group) => group.items.map((item) => item.id)), [
    "present",
    "past",
    "missing",
  ]);
});

test("month precision sorts by month end and remains unexpanded in labels", () => {
  const groups = groupExperienceTimeline([
    experience("exact", { endDate: "2024-02-15" }),
    experience("month", { endDate: "2024-02" }),
  ]);

  assert.deepEqual(groups[0]?.items.map((item) => item.id), ["month", "exact"]);
  assert.equal(experienceDateRange(experience("month", {
    startDate: "2022-01",
    endDate: "2024-02",
  })), "2022.01 – 2024.02");
});

test("experience filters normalize NFKC and require every exact tag", () => {
  const catalog = [
    experience("match", {
      category: "project",
      title: "Ｅlectron 离线同步",
      tags: ["Vue", "Sync"],
      currentRevision: revision("负责桌面端事实同步"),
    }),
    experience("partial", {
      category: "project",
      tags: ["Vue"],
      currentRevision: revision("Electron"),
    }),
  ];

  const result = filterExperienceCatalog(catalog, {
    query: " electron ",
    category: "project",
    tags: ["vue", "sync"],
  });
  assert.deepEqual(result.map((item) => item.id), ["match"]);
});

test("search context only reveals the hidden field that explained a match", () => {
  const item = experience("context", {
    title: "同步项目",
    location: "Hong Kong",
    currentRevision: revision("实现 Electron 离线恢复"),
  });

  assert.equal(experienceMatchContext(item, "Hong"), "地点：Hong Kong");
  assert.equal(experienceMatchContext(item, "Electron"), "实现 Electron 离线恢复");
  assert.equal(experienceMatchContext(item, "同步"), null);
});

test("highlighting uses existing text without unsafe HTML", () => {
  assert.deepEqual(highlightExperienceText("Electron Sync", "sync"), [
    { text: "Electron ", match: false },
    { text: "Sync", match: true },
  ]);
});

function experience(
  id: string,
  overrides: Partial<ExperienceSummary> = {},
): ExperienceSummary {
  return {
    id,
    category: "work",
    title: `Experience ${id}`,
    organization: "Coolto",
    role: "Engineer",
    location: null,
    startDate: "2023-01",
    endDate: "2023-12",
    tags: [],
    status: "active",
    currentRevisionId: `${id}-revision`,
    currentRevision: revision("default content"),
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    entityVersion: 1,
    deletedAt: null,
    syncStatus: "clean",
    ...overrides,
  };
}

function revision(content: string): NonNullable<ExperienceSummary["currentRevision"]> {
  return {
    id: "revision",
    experienceId: "experience",
    content,
    source: "manual",
    revisionHash: "hash",
    factBankStatus: "not_applicable",
    createdAt: "2026-07-29T00:00:00.000Z",
  };
}
