import assert from "node:assert/strict";
import test from "node:test";

import { extractLayoutText } from "../src/files/pdf-layout.js";

interface FakeItem {
  str: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

function item(span: FakeItem) {
  return {
    str: span.str,
    hasEOL: span.hasEOL ?? false,
    width: span.width ?? 100,
    height: span.height ?? 12,
    transform: [1, 0, 0, 1, span.x, span.y],
  };
}

test("single column: rows are ordered by y, spans within a row by x", () => {
  const text = extractLayoutText({
    items: [
      item({ str: "Engineer", x: 200, y: 90 }),
      item({ str: "Senior", x: 72, y: 90 }),
      item({ str: "Experience", x: 72, y: 60 }),
      item({ str: "Summary", x: 72, y: 30 }),
    ],
  });
  assert.equal(text, "Senior Engineer\nExperience\nSummary");
});

test("two columns: left column is emitted before right column", () => {
  const text = extractLayoutText({
    items: [
      // 右栏（先出现，验证输出不按输入顺序）
      item({ str: "Phone", x: 420, y: 90 }),
      item({ str: "Email", x: 420, y: 60 }),
      item({ str: "LinkedIn", x: 420, y: 30 }),
      // 左栏
      item({ str: "Alice Chen", x: 72, y: 90 }),
      item({ str: "Full-stack developer", x: 72, y: 60 }),
      item({ str: "6 years experience", x: 72, y: 30 }),
    ],
  });
  assert.equal(
    text,
    "Alice Chen\nFull-stack developer\n6 years experience\n\nPhone\nEmail\nLinkedIn",
  );
});

test("sparse header fragments on both sides do not trigger column split", () => {
  const text = extractLayoutText({
    items: [
      item({ str: "Alice Chen", x: 72, y: 120 }),
      item({ str: "2026-08-15", x: 500, y: 120 }),
      item({ str: "Summary paragraph", x: 72, y: 90 }),
      item({ str: "Experience paragraph", x: 72, y: 60 }),
      item({ str: "Education paragraph", x: 72, y: 30 }),
    ],
  });
  assert.ok(text.includes("Alice Chen 2026-08-15"), `got: ${text}`);
  assert.ok(text.includes("Summary paragraph"), `got: ${text}`);
});

test("hasEOL inside a row produces an inline newline", () => {
  const text = extractLayoutText({
    items: [
      item({ str: "line-one", x: 72, y: 30, hasEOL: true }),
      item({ str: "continuation", x: 72, y: 30 }),
    ],
  });
  assert.equal(text, "line-one\ncontinuation");
});

test("empty or textless pages produce empty output", () => {
  assert.equal(extractLayoutText({ items: [] }), "");
  assert.equal(
    extractLayoutText({
      items: [
        // 模拟 TextMarkedContent：无 str
        { str: undefined, hasEOL: false, width: 0, height: 0 },
      ],
    }),
    "",
  );
});

test("a full-width band inside a two-column page stays readable", () => {
  // 页底全宽元素中心居中，不应把输出打乱成无意义交错
  const text = extractLayoutText({
    items: [
      item({ str: "Skills", x: 72, y: 120 }),
      item({ str: "TypeScript", x: 72, y: 90 }),
      item({ str: "Education", x: 420, y: 120 }),
      item({ str: "Tsinghua", x: 420, y: 90 }),
      item({ str: "References available on request", x: 200, y: 30, width: 260 }),
    ],
  });
  assert.ok(text.includes("Skills"), `got: ${text}`);
  assert.ok(text.includes("Education"), `got: ${text}`);
  assert.ok(text.includes("References available on request"), `got: ${text}`);
});
