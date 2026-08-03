import {
  type ResumeContactField,
  type ResumeContactFields,
  normalizeResumeContact,
} from "./profile-contact.js";

export const RESUME_CONTACT_FIELD_ORDER: readonly ResumeContactField[] = [
  "fullName",
  "phone",
  "contactEmail",
  "location",
  "linkedinUrl",
  "githubUrl",
  "personalWebsite",
];

export interface ResumeContactImportField {
  field: ResumeContactField;
  currentValue: string | null;
  proposedValue: string;
  selectedByDefault: boolean;
}

/**
 * Import never turns a missing parsed value into a clearing operation. A later
 * Profile proposal may only apply fields that this function surfaced.
 */
export function proposeResumeContactImport(
  current: ResumeContactFields,
  parsed: ResumeContactFields,
): ResumeContactImportField[] {
  const normalizedCurrent = normalizeResumeContact(current);
  const normalizedParsed = normalizeResumeContact(parsed);
  return RESUME_CONTACT_FIELD_ORDER.flatMap((field) => {
    const proposedValue = normalizedParsed[field];
    if (!proposedValue || proposedValue === normalizedCurrent[field]) return [];
    return [{
      field,
      currentValue: normalizedCurrent[field],
      proposedValue,
      selectedByDefault: normalizedCurrent[field] === null,
    }];
  });
}

export function mergeSelectedResumeContactImport(
  current: ResumeContactFields,
  proposal: readonly ResumeContactImportField[],
  selectedFields: readonly ResumeContactField[],
): ResumeContactFields {
  const candidates = new Map(proposal.map((entry) => [entry.field, entry]));
  const selected = new Set(selectedFields);
  for (const field of selected) {
    if (!candidates.has(field)) {
      throw new Error("只能合并当前导入提案中的资料字段");
    }
  }
  const merged = normalizeResumeContact(current);
  for (const field of selected) {
    merged[field] = candidates.get(field)!.proposedValue;
  }
  return merged;
}
