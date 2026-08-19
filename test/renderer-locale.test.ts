import assert from "node:assert/strict";
import test from "node:test";

import {
  localizedRecord,
  setLocale,
  translate,
  translateDateRange,
  translateFormat,
} from "../src/desktop/renderer/src/i18n/locale.js";

test("renderer locale switches static, formatted, and date-range copy", () => {
  setLocale("en-US");
  assert.equal(translate("经历仓库"), "Experience library");
  assert.equal(
    translateFormat("{count} 次投递", { count: 3 }),
    "3 applications",
  );
  assert.equal(translateDateRange("2024.01 – 至今"), "2024.01 – Present");

  setLocale("zh-CN");
  assert.equal(translate("经历仓库"), "经历仓库");
});

test("localized records resolve against the current locale on every read", () => {
  const labels = localizedRecord({ active: "在用", archived: "已归档" });
  setLocale("en-US");
  assert.equal(labels.active, "Active");
  assert.equal(labels.archived, "Archived");
  setLocale("zh-CN");
  assert.equal(labels.active, "在用");
});

test("renderer locale translates personal information UI copy", () => {
  setLocale("en-US");
  assert.equal(translate("个人信息"), "Personal information");
  assert.equal(translate("带 * 的字段为简历生成必填项。"), "Fields marked * are required to generate a resume.");
  setLocale("zh-CN");
});

test("renderer locale translates the feedback entry copy", () => {
  setLocale("en-US");
  assert.equal(translate("帮助与反馈"), "Help & feedback");
  assert.equal(translate("提交反馈"), "Submit feedback");
  setLocale("zh-CN");
});
