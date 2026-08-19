import assert from "node:assert/strict";
import test from "node:test";

import { projectEducationRawText } from "../src/resume/education-details.js";
import { missingPdfTextFragments } from "../src/resume/export/pdf-integrity.js";
import type { ResumeSection, ResumeSectionItem, ResumeStructure } from "../src/resume/types.js";
import {
  orderResumeSections,
  presentResumeContacts,
  presentResumeItem,
} from "../src/desktop/renderer/src/resume-renderer/section-presenter.js";

test("Section E presents school and degree before the fixed major line", () => {
  assert.deepEqual(
    presentResumeItem(educationItem(), "education"),
    {
      primary: {
        primary: "Example University · Master of Science",
        side: "Sep 2023 – Jun 2025",
        primaryClass: "resume-document-entry-primary",
      },
      secondary: {
        primary: "Computer Science",
        side: "Hong Kong",
        primaryClass: "resume-document-entry-secondary",
      },
    },
  );
});

test("Section E fixes GPA, ranking, and coursework into three education lines", () => {
  const rawText = projectEducationRawText(
    "绩点：3.8/4.0，专业排名前10%。主修课程：数据结构、数据库系统、统计学。",
    "zh-CN",
    ["数据结构", "数据库系统", "统计学"],
  );
  assert.equal(
    rawText,
    "GPA 3.8/4.0（专业前 10%）\n主修课程：数据结构、数据库系统、统计学",
  );
  assert.deepEqual(
    presentResumeItem({
      ...educationItem(),
      title: "香港示例大学",
      organization: "计算机科学",
      role: "学士",
      raw_text: rawText,
    }, "education", "zh-CN"),
    {
      primary: {
        primary: "香港示例大学 · 学士",
        side: "Sep 2023 – Jun 2025",
        primaryClass: "resume-document-entry-primary",
      },
      secondary: {
        primary: "计算机科学 · GPA 3.8/4.0（专业前 10%）",
        side: "Hong Kong",
        primaryClass: "resume-document-entry-secondary",
      },
      tertiary: {
        primary: "主修课程：数据结构、数据库系统、统计学",
        side: "",
        primaryClass: "resume-document-entry-secondary",
      },
    },
  );
});

test("Section E separates a legacy Chinese major and qualified degree", () => {
  assert.deepEqual(
    presentResumeItem({
      ...educationItem(),
      title: "计算机科学理学硕士",
      organization: "香港科技大学",
      role: "工程学院",
    }, "education", "zh-CN"),
    {
      primary: {
        primary: "香港科技大学 · 理学硕士",
        side: "Sep 2023 – Jun 2025",
        primaryClass: "resume-document-entry-primary",
      },
      secondary: {
        primary: "计算机科学",
        side: "Hong Kong",
        primaryClass: "resume-document-entry-secondary",
      },
    },
  );
});

test("Section E omits absent optional education facts without placeholders", () => {
  assert.equal(projectEducationRawText("完成毕业论文答辩。", "zh-CN"), null);
  assert.equal(
    projectEducationRawText(
      "Top 5%. Coursework: Statistics, Python.",
      "en-US",
      ["Statistics", "Python"],
    ),
    "Top 5%\nRelevant Coursework: Statistics, Python",
  );
});

test("Section E renders Agent-identified courses instead of scanning prose labels", () => {
  assert.equal(
    projectEducationRawText(
      "英语（含核心金融课程）\n课程：公司金融、计量经济学。",
      "zh-CN",
      ["公司金融", "计量经济学"],
    ),
    "主修课程：公司金融、计量经济学",
  );
  assert.equal(
    projectEducationRawText(
      "Courses: Corporate Finance, Econometrics.",
      "en-US",
      ["Corporate Finance", "Econometrics"],
    ),
    "Relevant Coursework: Corporate Finance, Econometrics",
  );
  assert.equal(
    projectEducationRawText(
      "英语（含核心金融课程） · GPA 3.89/4.0\n课程：International Law, Economics",
      "zh-CN",
    ),
    "GPA 3.89/4.0",
  );
});

test("Section E supports canonical school-major-degree education fields", () => {
  assert.deepEqual(
    presentResumeItem({
      ...educationItem(),
      title: "香港中文大学",
      organization: "金融学",
      role: "硕士",
    }, "education"),
    {
      primary: {
        primary: "香港中文大学 · 硕士",
        side: "Sep 2023 – Jun 2025",
        primaryClass: "resume-document-entry-primary",
      },
      secondary: {
        primary: "金融学",
        side: "Hong Kong",
        primaryClass: "resume-document-entry-secondary",
      },
    },
  );
});

test("Section E presents company then localized position without changing right fields", () => {
  const item = {
    ...educationItem(),
    title: "数据产品实习生",
    organization: "Example Technology",
    role: "Data Product Intern",
  };
  assert.deepEqual(presentResumeItem(item, "experience", "zh-CN"), {
    primary: {
      primary: "Example Technology",
      side: "Sep 2023 – Jun 2025",
      primaryClass: "resume-document-entry-primary",
    },
    secondary: {
      primary: "数据产品实习生",
      side: "Hong Kong",
      primaryClass: "resume-document-entry-secondary",
    },
  });
  assert.deepEqual(presentResumeItem(item, "project", "zh-CN"), {
    primary: {
      primary: "数据产品实习生 · Example Technology",
      side: "Sep 2023 – Jun 2025",
      primaryClass: "resume-document-entry-primary",
    },
    secondary: {
      primary: "Data Product Intern",
      side: "Hong Kong",
      primaryClass: "resume-document-entry-secondary",
    },
  });
});

test("Section E emits required contacts and only confirmed optional values", () => {
  assert.deepEqual(
    presentResumeContacts({
      name: "Alex Chen", phone: "+852 1234 5678", email: "alex@example.com",
      location: "Hong Kong", linkedin: "https://linkedin.com/in/alex",
      github: "https://github.com/alex", website: "https://alex.example.com",
    }),
    [
      { text: "+852 1234 5678" }, { text: "alex@example.com" },
      { text: "Hong Kong" }, { text: "https://linkedin.com/in/alex", href: "https://linkedin.com/in/alex" },
      { text: "https://github.com/alex", href: "https://github.com/alex" },
      { text: "https://alex.example.com", href: "https://alex.example.com" },
    ],
  );
  assert.deepEqual(
    presentResumeContacts({
      name: "Alex Chen", phone: "+852 1234 5678", email: "alex@example.com",
      location: null, linkedin: null, github: null, website: null,
    }),
    [{ text: "+852 1234 5678" }, { text: "alex@example.com" }],
  );
  const longWebsite = `https://example.com/${"portfolio-".repeat(32)}case-study`;
  assert.deepEqual(
    presentResumeContacts({
      name: "Alex Chen", phone: "+852 1234 5678", email: "alex@example.com",
      location: null, linkedin: null, github: null, website: longWebsite,
    }),
    [{ text: "+852 1234 5678" }, { text: "alex@example.com" }, { text: longWebsite, href: longWebsite }],
  );
});

test("Section E keeps additional sections before the final multi-skill section", () => {
  const ordered = orderResumeSections([
    section("skills", "skills"), section("award", "other"), section("work", "experience"),
    section("education", "education"), section("project", "project"), section("paper", "other"),
  ]);
  assert.deepEqual(ordered.map((value) => value.id), [
    "education", "work", "project", "award", "paper", "skills",
  ]);
});

test("Section E PDF integrity requires every rendered contact field", () => {
  const structure: ResumeStructure = {
    language: "en-US",
    contact: {
      name: "Alex Chen", phone: "+852 1234 5678", email: "alex@example.com",
      location: "Hong Kong", linkedin: "https://linkedin.com/in/alex",
      github: "https://github.com/alex", website: "https://alex.example.com",
    },
    sections: [],
  };
  assert.deepEqual(missingPdfTextFragments("Alex Chen +852 1234 5678", structure), [
    "alex@example.com", "Hong Kong", "https://linkedin.com/in/alex",
    "https://github.com/alex", "https://alex.example.com",
  ]);
});

test("Section E PDF integrity follows the fixed education supplement", () => {
  const structure: ResumeStructure = {
    language: "zh-CN",
    contact: null,
    sections: [{
      id: "education",
      type: "education",
      heading: "教育经历",
      items: [{
        ...educationItem(),
        title: "香港示例大学",
        organization: "计算机科学",
        role: "学士",
        raw_text: "GPA 3.8/4.0（专业前 10%）\n主修课程：数据结构、数据库系统",
      }],
    }],
  };
  assert.deepEqual(
    missingPdfTextFragments(
      "教育经历 香港示例大学 学士 计算机科学 Sep 2023 Jun 2025 Hong Kong GPA 3.8/4.0（专业前 10%） 主修课程：数据结构、数据库系统",
      structure,
    ),
    [],
  );
});

test("Section E PDF integrity expects the rendered company and localized position", () => {
  const structure: ResumeStructure = {
    language: "zh-CN",
    contact: null,
    sections: [{
      id: "work",
      type: "experience",
      heading: "工作经历",
      items: [{
        ...educationItem(),
        title: "股票研究实习生",
        organization: "LongBridge Singapore",
        role: "Equity Research Intern",
      }],
    }],
  };
  assert.deepEqual(
    missingPdfTextFragments(
      "工作经历 LongBridge Singapore 股票研究实习生",
      structure,
    ),
    [],
  );
});

function educationItem(): ResumeSectionItem {
  return {
    id: "education-1", title: "Master of Science in Computer Science",
    organization: "Example University", role: "School of Engineering", location: "Hong Kong",
    start_date: "Sep 2023", end_date: "Jun 2025", source_experience_id: "education-1",
    bullets: [], raw_text: null,
  };
}

function section(id: string, type: ResumeSection["type"]): ResumeSection {
  return { id, type, heading: id, items: [] };
}
