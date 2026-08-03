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
  return qualifiedChinese();
}

export function markdownQualified(): CurrentResumeStructure {
  const structure = qualifiedChinese();
  const experience = structure.sections.find(
    (candidate) => candidate.type === "experience",
  );
  assertSection(experience);
  const firstBullet = experience.items[0]?.bullets[0];
  if (firstBullet) {
    firstBullet.text = firstBullet.text.replace(
      "梳理企业客户",
      "**梳理企业客户**",
    );
  }
  return structure;
}

export function longContactQualified(): CurrentResumeStructure {
  const structure = qualifiedChinese();
  if (structure.contact) {
    structure.contact.linkedin = null;
    structure.contact.website =
      "https://portfolio.example.com/case-studies/resume-renderer-field-mapping-and-chromium-pdf-regression";
  }
  return structure;
}

export function additionalContentQualified(): CurrentResumeStructure {
  const structure = qualifiedChinese();
  const skills = structure.sections.find((candidate) => candidate.type === "skills");
  assertSection(skills);
  skills.items[0]?.bullets.pop();
  structure.sections.push(section("section-certifications", "other", "证书", [
    item("certificate-1", {
      title: "数据产品与分析专业认证",
      organization: "示例认证机构",
      role: "职业资格证书",
      location: "香港",
      start_date: "2025.06",
      end_date: null,
      raw_text: null,
      bullets: [bullet(
        "certificate-1",
        "完成数据产品、指标体系、实验设计和跨团队协作课程，并通过案例分析与知识测评，证明能够将用户需求、数据证据和交付标准组织为可追溯的产品决策材料，并形成可复用的学习记录、实践复盘和能力提升计划。",
      )],
    }),
  ]));
  return structure;
}

function assertSection(
  value: ResumeSection | undefined,
): asserts value is ResumeSection {
  if (!value) {
    throw new Error("Fixture section is missing");
  }
}
