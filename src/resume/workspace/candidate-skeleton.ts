import type { ResumeSourceExperienceSnapshot, ResumeSourceSnapshot } from "../source-types.js";
import type {
  ResumeSection,
  ResumeSectionItem,
  ResumeStructure,
} from "../types.js";
import { ResumeWorkspaceError } from "./errors.js";
import type { ResumeCandidateLanguage } from "./types.js";

const HEADINGS = {
  "zh-CN": {
    education: "教育经历",
    experience: "工作经历",
    project: "项目经历",
    skills: "专业技能",
    skillItem: "技术与工具",
  },
  "en-US": {
    education: "EDUCATION",
    experience: "WORK EXPERIENCE",
    project: "PROJECT EXPERIENCE",
    skills: "PROFESSIONAL SKILLS",
    skillItem: "Technology & Tools",
  },
} as const;

export function buildResumeSkeleton(
  snapshot: ResumeSourceSnapshot,
  experienceOrder: readonly string[],
  language: ResumeCandidateLanguage,
): ResumeStructure {
  const ordered = resolveOrderedExperiences(snapshot, experienceOrder);
  const education = ordered.filter((experience) => experience.category === "education");
  if (!education.length) {
    throw new ResumeWorkspaceError(
      "missing_education_source",
      "Resume generation requires at least one selected education experience.",
    );
  }
  const unsupported = ordered.find(
    (experience) => !["education", "work", "project"].includes(experience.category),
  );
  if (unsupported) {
    throw new ResumeWorkspaceError(
      "unsupported_experience_category",
      `Experience ${unsupported.id} has unsupported resume category ${unsupported.category}.`,
    );
  }
  const headings = HEADINGS[language];
  const sections: ResumeSection[] = [
    createSection("section-education", "education", headings.education, education),
  ];
  const work = ordered.filter((experience) => experience.category === "work");
  if (work.length) {
    sections.push(
      createSection("section-experience", "experience", headings.experience, work),
    );
  }
  const projects = ordered.filter((experience) => experience.category === "project");
  if (projects.length) {
    sections.push(
      createSection("section-project", "project", headings.project, projects),
    );
  }
  const tags = uniqueTags(ordered);
  if (tags.length) {
    sections.push({
      id: "section-skills",
      type: "skills",
      heading: headings.skills,
      items: [
        {
          id: "item-skills",
          title: headings.skillItem,
          organization: null,
          role: null,
          location: null,
          start_date: null,
          end_date: null,
          source_experience_id: null,
          bullets: [],
          raw_text: tags.join(language === "zh-CN" ? "、" : ", "),
        },
      ],
    });
  }
  return {
    language,
    contact: {
      name: snapshot.profile.fullName,
      email: snapshot.profile.contactEmail,
      phone: snapshot.profile.phone,
      location: snapshot.profile.location,
      linkedin: snapshot.profile.linkedinUrl,
    },
    sections,
    layout_template_id: snapshot.template.templateId,
    layout_profile_version: snapshot.template.profileVersion,
    layout_profile_hash: snapshot.template.profileHash,
    layout_tuning: {
      body_font_scale: 1,
      body_line_height: 1.18,
      section_gap_scale: 1,
      item_gap_scale: 1,
      bullet_gap_scale: 1,
    },
    layout_target_band: { minimum: 0.85, target: 0.92, maximum: 0.98 },
  };
}

function resolveOrderedExperiences(
  snapshot: ResumeSourceSnapshot,
  order: readonly string[],
): ResumeSourceExperienceSnapshot[] {
  const ids = order.map((value) => value.trim());
  const snapshotIds = new Set(snapshot.experiences.map((experience) => experience.id));
  if (
    ids.length !== snapshotIds.size ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !snapshotIds.has(id))
  ) {
    throw new ResumeWorkspaceError(
      "invalid_experience_order",
      "Experience display order must contain every snapshot experience exactly once.",
    );
  }
  const byId = new Map(snapshot.experiences.map((experience) => [experience.id, experience]));
  return ids.map((id) => byId.get(id)!);
}

function createSection(
  id: string,
  type: ResumeSection["type"],
  heading: string,
  experiences: readonly ResumeSourceExperienceSnapshot[],
): ResumeSection {
  return { id, type, heading, items: experiences.map(createItem) };
}

function createItem(experience: ResumeSourceExperienceSnapshot): ResumeSectionItem {
  return {
    id: `item-${experience.id}`,
    title: experience.title,
    organization: experience.organization,
    role: experience.role,
    location: experience.location,
    start_date: experience.startDate,
    end_date: experience.endDate,
    source_experience_id: experience.id,
    bullets: [],
    raw_text: null,
  };
}

function uniqueTags(experiences: readonly ResumeSourceExperienceSnapshot[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of experiences.flatMap((experience) => [...experience.tags])) {
    const cleaned = tag.trim();
    const key = cleaned.toLocaleLowerCase();
    if (cleaned && !seen.has(key)) {
      seen.add(key);
      tags.push(cleaned);
    }
  }
  return tags;
}
