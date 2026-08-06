import type { ResumeSourceExperienceSnapshot, ResumeSourceSnapshot } from "../source-types.js";
import type {
  ResumeSection,
  ResumeSectionItem,
  ResumeStructure,
} from "../types.js";
import { ResumeWorkspaceError } from "./errors.js";
import type { ResumeCandidateLanguage } from "./types.js";
import {
  collectSkillEvidence,
  resumeSectionRegistry,
} from "./section-registry.js";

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
  const sections = resumeSectionRegistry(ordered, language).map((definition) =>
    createSection(
      definition.id,
      definition.type,
      definition.heading,
      definition.experiences,
      ordered,
    ),
  );
  return {
    language,
    contact: {
      name: snapshot.profile.fullName,
      email: snapshot.profile.contactEmail,
      phone: snapshot.profile.phone,
      location: snapshot.profile.location,
      linkedin: snapshot.profile.linkedinUrl,
      github: snapshot.profile.githubUrl,
      website: snapshot.profile.personalWebsite,
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
  allOrdered: readonly ResumeSourceExperienceSnapshot[],
): ResumeSection {
  if (type === "skills" && !experiences.length) {
    return { id, type, heading, items: synthesizeSkillItems(allOrdered) };
  }
  return { id, type, heading, items: experiences.map(createItem) };
}

/**
 * When no explicit skills experience exists, the skills section is built
 * from traceable tags: one item per experience whose tag appears in its own
 * content. The item title carries the skill words so the writer and the
 * agent can author evidence-bound skill bullets.
 */
function synthesizeSkillItems(
  experiences: readonly ResumeSourceExperienceSnapshot[],
): ResumeSectionItem[] {
  const byExperience = new Map<string, string[]>();
  for (const { skill, experienceId } of collectSkillEvidence(experiences)) {
    const list = byExperience.get(experienceId) ?? [];
    list.push(skill);
    byExperience.set(experienceId, list);
  }
  const experienceById = new Map(
    experiences.map((experience) => [experience.id, experience]),
  );
  return [...byExperience.entries()].map(([experienceId, skills]) => {
    const experience = experienceById.get(experienceId);
    return {
      id: `item-skills-${experienceId}`,
      title: `专业技能：${skills.join("、")}`,
      organization: null,
      role: null,
      location: null,
      start_date: null,
      end_date: null,
      source_experience_id: experienceId,
      bullets: [],
      raw_text: null,
    };
  });
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
