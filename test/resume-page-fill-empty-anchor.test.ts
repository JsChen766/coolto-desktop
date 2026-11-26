import assert from "node:assert/strict";
import test from "node:test";

import { ResumeWorkspaceError } from "../src/resume/workspace/errors.js";
import { applyIncrementalText } from
  "../src/resume/workspace/incremental-text-edit.js";
import { pageFillExpansionRewrites } from
  "../src/resume/workspace/page-fill-expansion-input.js";
import { composeTailExpansion } from
  "../src/resume/workspace/tail-repair-input.js";
import type { ResumeWorkspace } from "../src/resume/workspace/types.js";

// Before the fix an empty anchor spun `anchorPattern` forever inside the
// Electron main process; node:test cannot interrupt a synchronous loop, so a
// regression here shows up as a hung test run rather than a failure.

const BULLET = "负责数据分析工作";

function anchorError(code: ResumeWorkspaceError["code"]) {
  return (error: unknown): boolean =>
    error instanceof ResumeWorkspaceError && error.code === code;
}

test("placement=after without a usable anchor is rejected instead of hanging", () => {
  for (const anchor of [undefined, "", " ", "\t\n"]) {
    assert.throws(
      () => composeTailExpansion(BULLET, {
        bulletId: "b1",
        component: "method",
        placement: "after",
        ...(anchor === undefined ? {} : { anchor }),
        insertText: "使用Python",
      }, "zh-CN"),
      anchorError("bullet_anchor_not_found"),
      `anchor=${JSON.stringify(anchor)}`,
    );
  }
});

test("incremental edits reject an empty anchor with bullet_anchor_not_found", () => {
  assert.throws(
    () => applyIncrementalText(BULLET, {
      op: "insert_text",
      bulletId: "b1",
      after: "",
      text: "x",
      evidenceIds: [],
    }),
    anchorError("bullet_anchor_not_found"),
  );
  assert.throws(
    () => applyIncrementalText(BULLET, {
      op: "replace_substring",
      bulletId: "b1",
      from: "",
      to: "x",
      evidenceIds: [],
    }),
    anchorError("bullet_anchor_not_found"),
  );
});

test("a unique non-empty anchor still inserts after the anchor", () => {
  assert.equal(
    composeTailExpansion(BULLET, {
      bulletId: "b1",
      component: "method",
      placement: "after",
      anchor: "数据分析",
      insertText: "使用Python",
    }, "zh-CN"),
    "负责数据分析使用Python工作",
  );
});

test("ambiguous anchors are still rejected, including overlapping matches", () => {
  assert.throws(
    () => applyIncrementalText("分析数据并分析报告", {
      op: "insert_text",
      bulletId: "b1",
      after: "分析",
      text: "x",
      evidenceIds: [],
    }),
    anchorError("bullet_anchor_ambiguous"),
  );
  assert.throws(
    () => applyIncrementalText("aaa", {
      op: "insert_text",
      bulletId: "b1",
      after: "aa",
      text: "x",
      evidenceIds: [],
    }),
    anchorError("bullet_anchor_ambiguous"),
  );
});

test("page-fill lineExpansions reject placement=after without an anchor", () => {
  const workspace = pageFillWorkspace();
  for (const anchor of [undefined, " "]) {
    assert.throws(
      () => pageFillExpansionRewrites(workspace, [{
        bulletId: "b1",
        component: "method",
        placement: "after",
        ...(anchor === undefined ? {} : { anchor }),
        insertText: "使用Python",
      }]),
      /placement=after 必须提供 currentText 中唯一出现的非空 anchor/u,
      `anchor=${JSON.stringify(anchor)}`,
    );
  }
});

test("page-fill lineExpansions still apply anchored, prepend and append insertions", () => {
  const workspace = pageFillWorkspace();
  const insertion = {
    bulletId: "b1",
    component: "method" as const,
    insertText: "使用Python",
  };
  assert.deepEqual(
    pageFillExpansionRewrites(workspace, [
      { ...insertion, placement: "after", anchor: " 数据分析 " },
    ]),
    [{ bulletId: "b1", revisedText: "负责数据分析使用Python工作" }],
  );
  assert.deepEqual(
    pageFillExpansionRewrites(workspace, [{ ...insertion, placement: "prepend" }]),
    [{ bulletId: "b1", revisedText: "使用Python，负责数据分析工作" }],
  );
  assert.deepEqual(
    pageFillExpansionRewrites(workspace, [{ ...insertion, placement: "append" }]),
    [{ bulletId: "b1", revisedText: "负责数据分析工作，使用Python" }],
  );
});

/** Minimal first-generation workspace with one under-filled, grounded bullet. */
function pageFillWorkspace(): ResumeWorkspace {
  return {
    structure: {
      language: "zh-CN",
      sections: [{ items: [{ bullets: [{ id: "b1", text: BULLET }] }] }],
    },
    compileResult: {
      bullets: [{ bulletId: "b1", lineCount: 1, lastLineRatio: 0.4 }],
      pageCount: 1,
      overflowPx: 0,
      availableHeightPx: 1000,
      usedHeightPx: 200,
      bodyLineHeightPx: 20,
    },
    bulletProvenance: [{ bulletId: "b1", evidenceIds: ["ev-1"] }],
    sourceSnapshot: { experiences: [] },
    supplementalEvidence: [{
      evidenceId: "ev-1",
      experienceId: "exp-1",
      text: "负责数据分析工作，使用Python搭建自动化报表",
    }],
  } as unknown as ResumeWorkspace;
}
