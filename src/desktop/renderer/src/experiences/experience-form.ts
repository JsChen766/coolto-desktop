import type {
  ExperienceCreateInput,
  ExperienceDetail,
  ExperienceUpdateInput,
} from "../../../../api/types.js";
import type { ExperienceProposalSnapshot } from "../../../../experience/maintenance-types.js";
import type { ExperienceKind } from "../../../../experience/experience-kind.js";
import { fieldsForExperienceKind } from "../../../../experience/experience-kind.js";
import {
  experienceValidationIssues,
  type ExperienceValidationField,
} from "../../../../experience/validation.js";

export type StartDateMode = "none" | "month" | "day";
export type EndDateMode = "none" | "present" | "month" | "day";

export interface ExperienceFormDraft {
  category: ExperienceDetail["category"];
  title: string;
  organization: string;
  role: string;
  location: string;
  resumeSectionKey: string | null;
  resumeSectionLabel: string | null;
  startMode: StartDateMode;
  startValue: string;
  endMode: EndDateMode;
  endValue: string;
  tags: string[];
  tagInput: string;
  content: string;
  status: ExperienceDetail["status"];
}

export type ExperienceFormErrors = Partial<
  Record<ExperienceValidationField, string>
>;

export function cloneExperienceDraft(
  draft: ExperienceFormDraft,
): ExperienceFormDraft {
  return { ...draft, tags: [...draft.tags] };
}

export function emptyExperienceDraft(): ExperienceFormDraft {
  return {
    category: "work",
    title: "",
    organization: "",
    role: "",
    location: "",
    resumeSectionKey: null,
    resumeSectionLabel: null,
    startMode: "none",
    startValue: "",
    endMode: "none",
    endValue: "",
    tags: [],
    tagInput: "",
    content: "",
    status: "active",
  };
}

export function draftFromExperience(
  experience: ExperienceDetail,
): ExperienceFormDraft {
  const start = dateMode(experience.startDate);
  const end = experience.endDate === "present"
    ? { mode: "present" as const, value: "" }
    : dateMode(experience.endDate);
  return {
    category: experience.category,
    title: experience.title,
    organization: experience.organization ?? "",
    role: experience.role ?? "",
    location: experience.location ?? "",
    resumeSectionKey: experience.resumeSectionKey ?? null,
    resumeSectionLabel: experience.resumeSectionLabel ?? null,
    startMode: start.mode,
    startValue: start.value,
    endMode: end.mode,
    endValue: end.value,
    tags: [...experience.tags],
    tagInput: "",
    content: experience.currentRevision?.content ?? "",
    status: experience.status,
  };
}

export function experienceFormErrors(
  draft: ExperienceFormDraft,
): ExperienceFormErrors {
  const errors: ExperienceFormErrors = {};
  for (const issue of experienceValidationIssues(snapshot(draft))) {
    errors[issue.field] ??= issue.message;
  }
  return errors;
}

export function toExperienceCreateInput(
  draft: ExperienceFormDraft,
): ExperienceCreateInput {
  const value = normalized(draft);
  return {
    category: value.category,
    title: value.title,
    content: value.content,
    ...(value.organization ? { organization: value.organization } : {}),
    ...(value.role ? { role: value.role } : {}),
    ...(value.location ? { location: value.location } : {}),
    ...(value.startDate ? { startDate: value.startDate } : {}),
    ...(value.endDate ? { endDate: value.endDate } : {}),
    tags: value.tags,
    ...(value.resumeSectionKey ? { resumeSectionKey: value.resumeSectionKey } : {}),
    ...(value.resumeSectionLabel ? { resumeSectionLabel: value.resumeSectionLabel } : {}),
  };
}

export function toExperienceUpdateInput(
  draft: ExperienceFormDraft,
): ExperienceUpdateInput {
  const value = normalized(draft);
  return {
    category: value.category,
    title: value.title,
    content: value.content,
    organization: value.organization || null,
    role: value.role || null,
    location: value.location || null,
    startDate: value.startDate,
    endDate: value.endDate,
    tags: value.tags,
    resumeSectionKey: value.resumeSectionKey,
    resumeSectionLabel: value.resumeSectionLabel,
    status: value.status,
  };
}

export function sameExperienceDraft(
  left: ExperienceFormDraft,
  right: ExperienceFormDraft,
): boolean {
  return JSON.stringify(toExperienceUpdateInput(left))
    === JSON.stringify(toExperienceUpdateInput(right));
}

export function normalizeExperienceTags(
  tags: string[],
  pending = "",
): string[] {
  const result: string[] = [];
  const keys = new Set<string>();
  for (const raw of [...tags, ...pending.split(/[,，]/u)]) {
    const label = raw.normalize("NFKC").trim();
    const key = label.toLowerCase();
    if (label && !keys.has(key)) {
      keys.add(key);
      result.push(label);
    }
  }
  return result;
}

function snapshot(draft: ExperienceFormDraft): ExperienceProposalSnapshot {
  const value = normalized(draft);
  return {
    id: "form",
    category: value.category,
    title: value.title,
    content: value.content,
    organization: value.organization || null,
    role: value.role || null,
    location: value.location || null,
    startDate: value.startDate,
    endDate: value.endDate,
    tags: value.tags,
    resumeSectionKey: value.resumeSectionKey,
    resumeSectionLabel: value.resumeSectionLabel,
    status: value.status,
    revisionId: "form-revision",
    revisionHash: "form-revision-hash",
  };
}

function normalized(draft: ExperienceFormDraft) {
  return {
    category: draft.category,
    title: draft.title.trim(),
    content: draft.content.trim(),
    organization: draft.organization.trim(),
    role: draft.role.trim(),
    location: draft.location.trim(),
    startDate: dateValue(draft.startMode, draft.startValue),
    endDate: dateValue(draft.endMode, draft.endValue),
    tags: normalizeExperienceTags(draft.tags, draft.tagInput),
    resumeSectionKey: draft.resumeSectionKey,
    resumeSectionLabel: draft.resumeSectionLabel,
    status: draft.status,
  };
}

export function patchForExperienceKind(kind: ExperienceKind): Partial<ExperienceFormDraft> {
  const fields = fieldsForExperienceKind(kind);
  return kind === "skills"
    ? {
        ...fields,
        organization: "", role: "", location: "",
        startMode: "none", startValue: "", endMode: "none", endValue: "",
      }
    : fields;
}

function dateMode(value: string | null): { mode: StartDateMode; value: string } {
  if (!value) return { mode: "none", value: "" };
  return { mode: value.length === 7 ? "month" : "day", value };
}

function dateValue(
  mode: StartDateMode | EndDateMode,
  value: string,
): string | null {
  if (mode === "none") return null;
  if (mode === "present") return "present";
  return value;
}
