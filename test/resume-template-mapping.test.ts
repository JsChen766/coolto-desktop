import assert from "node:assert/strict";
import test from "node:test";

import { missingPdfTextFragments } from "../src/resume/export/pdf-integrity.js";
import type { ResumeSection, ResumeSectionItem, ResumeStructure } from "../src/resume/types.js";
import {
  orderResumeSections,
  presentResumeContacts,
  presentResumeItem,
} from "../src/desktop/renderer/src/resume-renderer/section-presenter.js";

test("Section E presents education as degree/date then institution/location", () => {
  assert.deepEqual(
    presentResumeItem(educationItem(), "education"),
    {
      primary: {
        primary: "Master of Science in Computer Science",
        side: "Sep 2023 – Jun 2025",
        primaryClass: "resume-document-entry-primary",
      },
      secondary: {
        primary: "Example University · School of Engineering",
        side: "Hong Kong",
        primaryClass: "resume-document-entry-secondary",
      },
    },
  );
});

test("Section E preserves the work and project line snapshot", () => {
  const item = {
    ...educationItem(),
    title: "Data Product Intern",
    organization: "Example Technology",
    role: "Product Intelligence",
  };
  const expected = {
    primary: {
      primary: "Data Product Intern · Example Technology",
      side: "Sep 2023 – Jun 2025",
      primaryClass: "resume-document-entry-primary",
    },
    secondary: {
      primary: "Product Intelligence",
      side: "Hong Kong",
      primaryClass: "resume-document-entry-secondary",
    },
  };
  assert.deepEqual(presentResumeItem(item, "experience"), expected);
  assert.deepEqual(presentResumeItem(item, "project"), expected);
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
