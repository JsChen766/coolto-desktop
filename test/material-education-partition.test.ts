import assert from "node:assert/strict";
import test from "node:test";

import { assertSingleEducationPeriod } from
  "../src/experience/material-partition.js";

test("one new education target rejects two explicit education periods", () => {
  assert.throws(() => assertSingleEducationPeriod([
    "A大学｜2016.09–2020.06",
    "B大学｜2020年9月 至 2022年6月",
  ].join("\n")), /拆成独立教育经历/u);
});

test("one education period and ordinary coursework dates remain accepted", () => {
  assert.doesNotThrow(() => assertSingleEducationPeriod(
    "A University · 2020-09 至 2022-06\n2021 年完成数据库课程项目",
  ));
  assert.doesNotThrow(() => assertSingleEducationPeriod(
    "A University · Master of Science",
  ));
});
