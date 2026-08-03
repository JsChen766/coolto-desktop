import type { CurrentResumeStructure } from "../types.js";
import { baseStructure, bullet, educationEn, item, section } from "./fixture-builders.js";

export function qualifiedEnglish(): CurrentResumeStructure {
  return baseStructure("en-US", [
    educationEn,
    section("section-experience", "experience", "WORK EXPERIENCE", [
      item("work-1", {
        title: "Product and Data Intern",
        organization: "Example Technology Limited",
        role: "Product Intelligence Team",
        location: "Shenzhen",
        start_date: "Jan 2025",
        end_date: "Jun 2025",
        raw_text: null,
        bullets: [
          bullet("en-1", "Mapped enterprise resume-review workflows and converted interview evidence into a structured requirement backlog that clarified the first release scope."),
          bullet("en-2", "Built a traceable analytics dashboard with shared metric definitions and anomaly checks to support weekly product reviews and prioritization decisions."),
          bullet("en-3", "Partnered with engineers to test document parsing and content generation across English, Chinese, and mixed-language edge cases before release."),
          bullet("en-4", "Maintained a severity-based feedback register with reproducible steps and acceptance criteria, improving cross-functional issue ownership and closure."),
        ],
      }),
      item("work-2", {
        title: "Data Analytics Intern",
        organization: "Example Advisory",
        role: "Digital Consulting",
        location: "Shanghai",
        start_date: "May 2024",
        end_date: "Sep 2024",
        raw_text: null,
        bullets: [
          bullet("en-5", "Cleaned operational data from multiple teams and established field mappings, missing-value rules, and sampling checks for repeatable analysis."),
          bullet("en-6", "Analyzed channel performance and conversion drop-off points, translating findings into management-ready charts and concrete follow-up actions."),
          bullet("en-7", "Verified figures and analytical definitions against source data while maintaining a clear record of changes across client deliverable versions."),
        ],
      }),
    ]),
    section("section-project", "project", "PROJECTS", [
      item("project-1", {
        title: "Evidence-Grounded Resume Workspace",
        organization: "Independent Project",
        role: "Product Design and Engineering",
        location: "Hong Kong",
        start_date: "Mar 2025",
        end_date: "Present",
        raw_text: null,
        bullets: [
          bullet("en-8", "Designed structured links between experience records, job requirements, and resume versions so each generated claim remains traceable to source evidence."),
          bullet("en-9", "Implemented stable-ID patches and candidate snapshots to preserve verified content while a single bullet or section is revised."),
          bullet("en-10", "Used browser layout measurements to validate page density and final-line width, providing deterministic feedback for one-page compilation."),
        ],
      }),
    ]),
  ]);
}
