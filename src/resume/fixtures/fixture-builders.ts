import type {
  CurrentResumeStructure,
  ResumeBullet,
  ResumeSection,
  ResumeSectionItem,
} from "../types.js";

const STANDARD_PROFILE_VERSION = "resume-template-v2";
const STANDARD_PROFILE_HASH =
  "130b516b3eb2f0a5a335ff525eebd3ca43dcce1053ab02a06d384e3a18f09fc0";

export function bullet(id: string, text: string): ResumeBullet {
  return {
    id,
    text,
    source_fact_ids: [`fact-${id}`],
    matched_jd_requirement_ids: [],
  };
}

export function item(
  id: string,
  input: Omit<ResumeSectionItem, "id" | "source_experience_id">,
): ResumeSectionItem {
  return {
    id,
    source_experience_id: `experience-${id}`,
    ...input,
  };
}

export function section(
  id: string,
  type: ResumeSection["type"],
  heading: string,
  items: ResumeSectionItem[],
): ResumeSection {
  return { id, type, heading, items };
}

export function bulletList(prefix: string, texts: readonly string[]): ResumeBullet[] {
  return texts.map((text, index) => bullet(`${prefix}-${index + 1}`, text));
}

export function baseStructure(
  language: string,
  sections: ResumeSection[],
): CurrentResumeStructure {
  return {
    language,
    contact: {
      name: language.startsWith("zh") ? "陈简历" : "Alex Chen",
      email: "alex.chen@example.com",
      phone: "+86 138 0000 0000",
      location: language.startsWith("zh") ? "香港" : "Hong Kong",
      linkedin: "https://linkedin.com/in/alex-chen",
      github: null,
      website: null,
    },
    sections,
    layout_template_id: "resume-standard",
    layout_profile_version: STANDARD_PROFILE_VERSION,
    layout_profile_hash: STANDARD_PROFILE_HASH,
    layout_tuning: {
      body_font_scale: 1,
      body_line_height: 1.18,
      section_gap_scale: 1,
      item_gap_scale: 1,
      bullet_gap_scale: 1,
    },
    layout_target_band: {
      minimum: 0.92,
      target: 0.95,
      maximum: 0.98,
    },
  };
}

export const educationZh = section("section-education", "education", "教育经历", [
  item("education-1", {
    title: "计算机科学理学硕士",
    organization: "香港科技大学",
    role: "工程学院",
    location: "香港",
    start_date: "2023.09",
    end_date: "2025.06",
    bullets: [],
    raw_text: null,
  }),
]);

export const educationEn = section("section-education", "education", "EDUCATION", [
  item("education-1", {
    title: "MSc in Computer Science and Engineering",
    organization: "Hong Kong University of Science and Technology",
    role: "School of Engineering",
    location: "Hong Kong",
    start_date: "Sep 2023",
    end_date: "Jun 2025",
    bullets: [],
    raw_text: null,
  }),
]);
