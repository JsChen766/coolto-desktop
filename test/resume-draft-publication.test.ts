import assert from "node:assert/strict";
import test from "node:test";

import { shouldPublishResumeWorkspace } from
  "../src/desktop/main/resume-drafts/draft-publication.js";
import type { ResumeWorkspace } from
  "../src/resume/workspace/types.js";

test("an empty material-blocked workspace stays internal", () => {
  assert.equal(shouldPublishResumeWorkspace(workspace([])), false);
});

test("the first grounded content makes the workspace publishable", () => {
  assert.equal(shouldPublishResumeWorkspace(workspace(["已写入事实"])), true);
});

test("an existing draft still receives an empty recovery update", () => {
  assert.equal(shouldPublishResumeWorkspace(workspace([]), true), true);
});

function workspace(bullets: string[]): ResumeWorkspace {
  return {
    status: "needs_user_decision",
    structure: {
      sections: [{
        type: "experience",
        title: "工作经历",
        items: [{
          id: "item-work-1",
          title: "数据分析",
          organization: "Example",
          location: "",
          date_range: "",
          bullets: bullets.map((text, index) => ({
            id: `bullet-${index}`,
            text,
            matched_jd_requirement_ids: [],
          })),
          source_experience_id: "work-1",
        }],
      }],
    },
  } as unknown as ResumeWorkspace;
}
