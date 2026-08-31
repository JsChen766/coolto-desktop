import { getResumeFixture } from "../../../../resume/fixtures.js";
import type {
  CurrentResumeStructure,
  ResumeBullet,
  ResumeSectionItem,
} from "../../../../resume/types.js";

export function createOnboardingSampleResume(): CurrentResumeStructure {
  const structure = getResumeFixture("zh-qualified");
  structure.contact = {
    name: "林小满（示例）", phone: "+852 5555 0108",
    email: "demo@coolto.example", location: "Hong Kong",
    linkedin: null, github: null, website: null,
  };
  structure.sections = [
    {
      id: "sample-education", type: "education", heading: "教育经历",
      items: [item("education", {
        title: "商业分析本科", organization: "Harbour University（示例）",
        role: "学生", location: "Hong Kong", start_date: "2021-09",
        end_date: "2025-06", bullets: [], raw_text: null,
      })],
    },
    {
      id: "sample-work", type: "experience", heading: "工作经历",
      items: [item("work", {
        title: "增长分析实习", organization: "Orbit Commerce（示例）",
        role: "Growth Analytics Intern", location: "Hong Kong",
        start_date: "2025-03", end_date: "2025-08", raw_text: null,
        bullets: [
          bullet("work-1", "搭建新用户激活漏斗看板，分析 4 个关键步骤的流失并形成可复查的指标口径"),
          bullet("work-2", "设计两轮 A/B 实验，脱敏示例结果为新用户激活率提升 12%"),
          bullet("work-3", "与产品及运营团队复盘实验结果，整理下一轮验证假设和数据需求"),
        ],
      })],
    },
    {
      id: "sample-project", type: "project", heading: "项目经历",
      items: [item("project", {
        title: "用户研究项目", organization: "City Data Lab（示例）",
        role: "项目成员", location: "Hong Kong", start_date: "2024-09",
        end_date: "2025-01", raw_text: null,
        bullets: [
          bullet("project-1", "整理 18 份脱敏访谈记录与行为数据，归纳关键使用障碍"),
          bullet("project-2", "将研究结果转化为产品建议，并明确证据范围和待验证假设"),
        ],
      })],
    },
    {
      id: "sample-skills", type: "skills", heading: "专业技能",
      items: [item("skills", {
        title: "数据与分析", organization: null, role: null, location: null,
        start_date: null, end_date: null, raw_text: null,
        bullets: [
          bullet("skills-1", "SQL、Python、实验分析、指标体系设计、数据可视化与跨团队沟通"),
        ],
      })],
    },
  ];
  structure.quality_status = "passed";
  structure.layout_usage_ratio = 0.93;
  return structure;
}

function item(
  id: string,
  value: Omit<ResumeSectionItem, "id" | "source_experience_id">,
): ResumeSectionItem {
  return { id: `sample-${id}`, source_experience_id: `sample-${id}`, ...value };
}

function bullet(id: string, text: string): ResumeBullet {
  return {
    id: `sample-${id}`, text, matched_jd_requirement_ids: [],
    source_fact_ids: [`sample-fact-${id}`],
  };
}
