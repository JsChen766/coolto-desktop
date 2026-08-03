import {
  proposeResumeContactImport,
  RESUME_CONTACT_FIELD_ORDER,
} from "../resume/contracts/profile-import-contract.js";
import type {
  ResumeContactField,
  ResumeContactFields,
} from "../resume/contracts/profile-contact.js";
import type { ProfileImportField } from "./types.js";

export interface ParsedProfileImportField {
  value: string;
  confidence?: "high" | "low";
}

export type ParsedProfileImport = Partial<Record<
  ResumeContactField,
  ParsedProfileImportField
>>;

/** Normalizes only document-extracted fields; absent input can never clear a Profile value. */
export function normalizeProfileImport(
  current: ResumeContactFields,
  input: ParsedProfileImport,
): ProfileImportField[] {
  const parsed: ResumeContactFields = {
    fullName: null, phone: null, contactEmail: null, location: null,
    linkedinUrl: null, githubUrl: null, personalWebsite: null,
  };
  for (const field of RESUME_CONTACT_FIELD_ORDER) {
    parsed[field] = input[field]?.value ?? null;
  }
  return proposeResumeContactImport(current, parsed).map((field) => ({
    ...field,
    confidence: input[field.field]?.confidence ?? "high",
  }));
}
