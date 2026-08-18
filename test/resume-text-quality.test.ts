import assert from "node:assert/strict";
import test from "node:test";

import { findResumePaddingIssue } from
  "../src/resume/planning/text-padding.js";

test("resume bullets reject a chained abstract tail used only to fill width", () => {
  assert.equal(
    findResumePaddingIssue(
      "定位转化瓶颈并沉淀方法论与经验与最佳实践与标准化流程与推广策略",
    ),
    "连续抽象并列词",
  );
});

test("resume bullets keep concrete lists and one natural outcome clause", () => {
  assert.equal(
    findResumePaddingIssue(
      "协调产品、设计、研发、测试与客户支持成员，将用户故事拆成可独立验收的交付项",
    ),
    null,
  );
  assert.equal(
    findResumePaddingIssue(
      "将成功率提升至 79%，并维护需求池与验收标准",
    ),
    null,
  );
});

test("resume bullets reject vague suffixes that merely consume width", () => {
  for (const text of [
    "验证引导策略对用户转化的实际有效性并推动最优方案落地",
    "优化用户转化与留存表现并形成数据驱动决策闭环",
    "系统强化数据分析与教学能力并沉淀标准化课程体系",
    "建立作业反馈机制并保障学习效果",
    "修复埋点质量问题并为后续分析奠定可靠基础",
  ]) {
    assert.equal(findResumePaddingIssue(text), "空泛效果结尾");
  }
});
