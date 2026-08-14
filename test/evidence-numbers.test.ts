import { strict as assert } from "node:assert";
import { test } from "node:test";

import { extractEvidenceNumbers } from "../src/resume/evidence-numbers.js";

test("extractEvidenceNumbers: arabic numbers and units canonicalize", () => {
  assert.deepEqual(extractEvidenceNumbers("10万+ / 100,000+ / 100000"), [
    "100000",
    "100000",
    "100000",
  ]);
  assert.deepEqual(extractEvidenceNumbers("占用率 80%"), ["80"]);
  assert.deepEqual(extractEvidenceNumbers("3.3 与 3 不同"), ["3.3", "3"]);
  assert.deepEqual(extractEvidenceNumbers("36Kr 累计阅读 100K+"), ["36", "100"]);
});

test("extractEvidenceNumbers: chinese numerals canonicalize", () => {
  assert.deepEqual(extractEvidenceNumbers("第十八届"), ["18"]);
  assert.deepEqual(extractEvidenceNumbers("三十份报告"), ["30"]);
  assert.deepEqual(extractEvidenceNumbers("一百二十家企业"), ["120"]);
  assert.deepEqual(extractEvidenceNumbers("三大支柱"), ["3"]);
  assert.deepEqual(extractEvidenceNumbers("两大国企"), ["2"]);
  assert.deepEqual(extractEvidenceNumbers("十大海外市场"), ["10"]);
  // standalone 十 is a precise count ("十大", "十余" ≈ 10) and stays a
  // verifiable claim; standalone 百/千/万/亿 are vague wording ("数百", "上千")
  assert.deepEqual(extractEvidenceNumbers("数百家"), []);
  assert.deepEqual(extractEvidenceNumbers("十余年"), ["10"]);
});

test("extractEvidenceNumbers: standalone 一 is a morpheme, not a number", () => {
  assert.deepEqual(extractEvidenceNumbers("一级市场"), []);
  assert.deepEqual(extractEvidenceNumbers("第一轮"), []);
  assert.deepEqual(extractEvidenceNumbers("统一管理"), []);
  assert.deepEqual(extractEvidenceNumbers("完全一致"), []);
  // 一 inside a multi-digit chinese number still counts
  assert.deepEqual(extractEvidenceNumbers("十一"), ["11"]);
  assert.deepEqual(extractEvidenceNumbers("二十一"), ["21"]);
  assert.deepEqual(extractEvidenceNumbers("一百"), ["100"]);
});

test("extractEvidenceNumbers: english number words map to arabic", () => {
  assert.deepEqual(
    extractEvidenceNumbers(
      "two major state-owned enterprises and ten overseas markets",
    ),
    ["2", "10"],
  );
  assert.deepEqual(extractEvidenceNumbers("three-pillar strategy"), ["3"]);
  assert.deepEqual(extractEvidenceNumbers("seven-way comparison"), ["7"]);
  assert.deepEqual(extractEvidenceNumbers("twenty-one models"), ["21"]);
  assert.deepEqual(extractEvidenceNumbers("over fifty firms"), ["50"]);
});

test("extractEvidenceNumbers: chinese resume can verify against english evidence", () => {
  const evidence = new Set(
    extractEvidenceNumbers(
      "Conducted a 7-way comparison; two major state-owned enterprises; " +
        "ten major overseas markets; three-pillar AI strategy; 10+ clients",
    ),
  );
  assert.deepEqual([...evidence].sort(), ["10", "2", "3", "7"]);
  const bullet = extractEvidenceNumbers(
    "覆盖十大海外市场，服务两大国企，三大支柱策略，10+ 客户",
  );
  for (const value of bullet) {
    assert.ok(
      evidence.has(value),
      `bullet number ${value} should exist in evidence numbers ${[...evidence].join(", ")}`,
    );
  }
});
