import assert from "node:assert/strict";
import test from "node:test";

import type { ExperienceDetail, ExperienceRevision } from "../src/api/types.js";
import {
  canRestoreExperienceRevision,
  experienceRevisionSourceLabel,
  mergeExperienceRevisions,
  restoreDisabledReason,
} from "../src/experience/history-model.js";

test("revision pages merge stably without duplicates", () => {
  const merged = mergeExperienceRevisions(
    [revision("r3", "third"), revision("r2", "second")],
    [revision("r2", "second fresh"), revision("r1", "first")],
  );
  assert.deepEqual(merged.map((item) => item.id), ["r3", "r2", "r1"]);
  assert.equal(merged[1]?.content, "second fresh");
});

test("same content and blocked sync states cannot restore", () => {
  const current = detail("clean");
  assert.equal(canRestoreExperienceRevision(current, revision("old", "current")), false);
  assert.equal(restoreDisabledReason(current, revision("old", "current")), "已是当前正文");
  const conflict = detail("conflict");
  assert.equal(canRestoreExperienceRevision(conflict, revision("old", "different")), false);
  assert.equal(restoreDisabledReason(conflict, revision("old", "different")), "请先处理同步问题");
  assert.equal(canRestoreExperienceRevision(detail("pending"), revision("old", "different")), true);
});

test("known revision sources have user-facing labels", () => {
  assert.equal(experienceRevisionSourceLabel("manual"), "手动编辑");
  assert.equal(experienceRevisionSourceLabel("import"), "导入");
  assert.equal(experienceRevisionSourceLabel("unknown"), "其他来源");
});

function detail(
  syncStatus: NonNullable<ExperienceDetail["syncStatus"]>,
): ExperienceDetail {
  const current = revision("current", "current");
  return {
    id: "exp-1", category: "work", title: "Engineer", organization: null,
    role: null, location: null, startDate: null, endDate: null, tags: [],
    status: "active", currentRevisionId: current.id, currentRevision: current,
    createdAt: NOW, updatedAt: NOW, entityVersion: 2, deletedAt: null,
    revisions: [current], syncStatus,
  };
}

function revision(id: string, content: string): ExperienceRevision {
  return {
    id, experienceId: "exp-1", content, source: "manual",
    revisionHash: content, factBankStatus: "not_applicable", createdAt: NOW,
  };
}

const NOW = "2026-07-29T00:00:00.000Z";
