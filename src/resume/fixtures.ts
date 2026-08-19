import type { CurrentResumeStructure } from "./types.js";
import { qualifiedEnglish } from "./fixtures/en-qualified.js";
import {
  additionalContentQualified,
  educationDetailsQualified,
  longContactQualified,
  markdownQualified,
  mixed,
  overflow,
  tailFailure,
  underfilled,
} from "./fixtures/fixture-variants.js";
import { qualifiedChinese } from "./fixtures/zh-qualified.js";

export const RESUME_FIXTURES = {
  "zh-qualified": qualifiedChinese(),
  "en-qualified": qualifiedEnglish(),
  "mixed-qualified": mixed(),
  "markdown-qualified": markdownQualified(),
  "long-contact-qualified": longContactQualified(),
  "additional-content-qualified": additionalContentQualified(),
  "education-details-qualified": educationDetailsQualified(),
  underfilled: underfilled(),
  "tail-failure": tailFailure(),
  overflow: overflow(),
} as const;

export type ResumeFixtureId = keyof typeof RESUME_FIXTURES;

export function getResumeFixture(id: string): CurrentResumeStructure {
  const fixture = RESUME_FIXTURES[id as ResumeFixtureId];
  if (!fixture) throw new Error(`Unknown resume fixture: ${id}`);
  return structuredClone(fixture);
}
