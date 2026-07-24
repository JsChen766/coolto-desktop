import assert from "node:assert/strict";
import test from "node:test";

import { resumePdfFilename } from "../src/resume/export/filename.js";
import { missingPdfTextFragments } from "../src/resume/export/pdf-integrity.js";
import type { ResumeStructure } from "../src/resume/types.js";

test("PDF text integrity finds missing structured visible content", () => {
  const structure = structureFixture();
  assert.deepEqual(
    missingPdfTextFragments(
      "陈简历 工作经历 产品实习生 建立可追溯的需求清单",
      structure,
    ),
    [],
  );
  assert.deepEqual(
    missingPdfTextFragments("陈简历 工作经历 产品实习生", structure),
    ["建立可追溯的需求清单"],
  );
});

test("PDF filenames remove path and control characters and keep one extension", () => {
  assert.equal(resumePdfFilename(" ../产品:经理?.PDF "), "产品-经理.pdf");
  assert.equal(resumePdfFilename("\u0000\n"), "resume.pdf");
});

function structureFixture(): ResumeStructure {
  return {
    language: "zh-CN",
    contact: { name: "陈简历", email: null, phone: null, location: null },
    sections: [{
      id: "section-work",
      type: "experience",
      heading: "工作经历",
      items: [{
        id: "item-work",
        title: "产品实习生",
        organization: null,
        role: null,
        start_date: null,
        end_date: null,
        source_experience_id: "exp-1",
        raw_text: null,
        bullets: [{
          id: "bullet-1",
          text: "建立**可追溯**的需求清单",
          matched_jd_requirement_ids: [],
        }],
      }],
    }],
  };
}
