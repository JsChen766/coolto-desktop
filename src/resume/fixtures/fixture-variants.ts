import type {
  CurrentResumeStructure,
  ResumeSection,
} from "../types.js";
import {
  baseStructure,
  bullet,
  educationZh,
  item,
  section,
} from "./fixture-builders.js";
import { qualifiedChinese } from "./zh-qualified.js";

export function underfilled(): CurrentResumeStructure {
  return baseStructure("zh-CN", [educationZh]);
}

export function tailFailure(): CurrentResumeStructure {
  return baseStructure("zh-CN", [
    educationZh,
    section("section-experience", "experience", "工作经历", [
      item("work-tail", {
        title: "产品实习生",
        organization: "示例科技有限公司",
        role: "产品团队",
        location: "深圳",
        start_date: "2025.01",
        end_date: "2025.06",
        raw_text: null,
        bullets: [bullet("tail-short", "整理需求。")],
      }),
    ]),
  ]);
}

export function overflow(): CurrentResumeStructure {
  const structure = qualifiedChinese();
  const work = structure.sections.find((candidate) => candidate.type === "experience");
  assertSection(work);
  for (let index = 0; index < 18; index += 1) {
    work.items[0]?.bullets.push(
      bullet(
        `overflow-${index + 1}`,
        `补充验证条目 ${index + 1}：围绕同一套真实排版基准执行页面结构、字体加载、视觉行分组和溢出诊断，用于确认内容超过单页后能够稳定返回明确错误。`,
      ),
    );
  }
  return structure;
}

export function mixed(): CurrentResumeStructure {
  const structure = qualifiedChinese();
  const skills = structure.sections.find((candidate) => candidate.type === "skills");
  assertSection(skills);
  if (skills.items[0]) {
    skills.items[0].raw_text =
      "TypeScript、Python、SQL、Vue 3、Electron、Chromium DOM Measurement、产品需求拆解";
  }
  return structure;
}

export function markdownQualified(): CurrentResumeStructure {
  const structure = qualifiedChinese();
  const experience = structure.sections.find(
    (candidate) => candidate.type === "experience",
  );
  const skills = structure.sections.find((candidate) => candidate.type === "skills");
  assertSection(experience);
  assertSection(skills);
  const firstBullet = experience.items[0]?.bullets[0];
  if (firstBullet) {
    firstBullet.text = firstBullet.text.replace(
      "梳理企业客户",
      "**梳理企业客户**",
    );
  }
  if (skills.items[0]) {
    skills.items[0].raw_text =
      "**TypeScript**、Python、SQL、Vue、Electron、数据分析、产品需求拆解、结构化写作";
  }
  return structure;
}

function assertSection(
  value: ResumeSection | undefined,
): asserts value is ResumeSection {
  if (!value) {
    throw new Error("Fixture section is missing");
  }
}
