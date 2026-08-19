import assert from "node:assert/strict";
import test from "node:test";

import { findResumePaddingIssue } from
  "../src/resume/planning/text-padding.js";
import { findRepeatedFragment } from
  "../src/resume/planning/text-repetition.js";

test("resume bullets reject a chained abstract tail used only to fill width", () => {
  assert.equal(
    findResumePaddingIssue(
      "定位转化瓶颈并沉淀方法论与经验与最佳实践与标准化流程与推广策略",
    ),
    "连续抽象并列词",
  );
});

test("resume bullets reject an abstract cognition tail without a concrete result", () => {
  assert.equal(
    findResumePaddingIssue("系统梳理技术路线，形成覆盖多环节的行业认知与投资判断"),
    "抽象认知结尾",
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
  assert.equal(
    findResumePaddingIssue(
      "每周跟踪 IPO 管线与半导体行业动态，与创投机构、创业者与行业专家开展 5+ 次访谈，输出研究备忘录与周报",
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

test("resume bullets reject vague coverage and support tails", () => {
  for (const text of [
    "梳理收入驱动与客户需求，形成对盈利来源的完整理解，覆盖托管等核心业务",
    "梳理设备机会与国产替代瓶颈，覆盖设备国产化全链条",
    "统筹报告输出，覆盖从行业分析到估值建模全环节并形成统一结论",
    "构建 DCF 模型，支撑估值与投资建议的量化依据",
    "输出可复用的估值框架与投资建议依据",
    "制定三支柱 AI 战略并增强长期竞争力与运营韧性",
  ]) {
    assert.equal(findResumePaddingIssue(text), "空泛覆盖或支撑结尾");
  }
});

test("resume repetition detection ignores partial English word collisions", () => {
  assert.equal(
    findRepeatedFragment(
      "Collaborated with VCs, led founder interviews for 5+ semiconductor startups, and crafted commercial models for 5+ startups in fundraises",
    ),
    null,
  );
  assert.ok(findRepeatedFragment(
    "负责数据分析并形成周报，负责数据分析并形成周报",
  ));
});
