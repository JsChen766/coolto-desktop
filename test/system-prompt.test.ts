import assert from "node:assert/strict";
import test from "node:test";

import {
  COOLTO_SYSTEM_PROMPT,
  SYSTEM_PROMPT_VERSION,
} from "../src/agent/system-prompt.js";

test("system prompt defines autonomous tool choice and clarification behavior", () => {
  assert.match(COOLTO_SYSTEM_PROMPT, /自然语言意图/);
  assert.match(COOLTO_SYSTEM_PROMPT, /选择最合适的工具/);
  assert.match(COOLTO_SYSTEM_PROMPT, /不确定性/);
  assert.match(COOLTO_SYSTEM_PROMPT, /追问/);
  assert.match(COOLTO_SYSTEM_PROMPT, /不得编造/);
  assert.match(COOLTO_SYSTEM_PROMPT, /nextCursor/);
  assert.match(COOLTO_SYSTEM_PROMPT, /覆盖全部经历/);
  assert.match(COOLTO_SYSTEM_PROMPT, /currentRevision\.content/);
  assert.match(COOLTO_SYSTEM_PROMPT, /sourceQuote/);
  assert.match(COOLTO_SYSTEM_PROMPT, /UTF-16/);
  assert.match(COOLTO_SYSTEM_PROMPT, /prepare_resume_candidate/);
  assert.match(COOLTO_SYSTEM_PROMPT, /patch_resume_candidate/);
  assert.match(COOLTO_SYSTEM_PROMPT, /visibleText/);
  assert.match(COOLTO_SYSTEM_PROMPT, /layout_qualified/);
  assert.match(COOLTO_SYSTEM_PROMPT, /review_resume_candidate/);
  assert.match(COOLTO_SYSTEM_PROMPT, /alternativeTargets/);
  assert.match(COOLTO_SYSTEM_PROMPT, /ready_for_approval/);
  assert.match(COOLTO_SYSTEM_PROMPT, /prepare_resume_save/);
  assert.match(COOLTO_SYSTEM_PROMPT, /list_resumes/);
  assert.match(COOLTO_SYSTEM_PROMPT, /get_resume/);
  assert.match(COOLTO_SYSTEM_PROMPT, /用户接受前不得声称已保存/);
  assert.match(COOLTO_SYSTEM_PROMPT, /prepare_resume_pdf_export/);
  assert.match(COOLTO_SYSTEM_PROMPT, /系统对话框/);
  assert.match(COOLTO_SYSTEM_PROMPT, /不得声称已导出/);
  assert.match(COOLTO_SYSTEM_PROMPT, /needs_user_decision/);
  assert.match(COOLTO_SYSTEM_PROMPT, /不得自行生成待决策卡片/);
  assert.match(COOLTO_SYSTEM_PROMPT, /接受、拒绝、自定义回答/);
  assert.match(COOLTO_SYSTEM_PROMPT, /Webmail/);
  assert.match(COOLTO_SYSTEM_PROMPT, /browser_tag_elements/);
  assert.match(COOLTO_SYSTEM_PROMPT, /browser_upload_file/);
  assert.match(COOLTO_SYSTEM_PROMPT, /browser_start_review/);
  assert.match(COOLTO_SYSTEM_PROMPT, /contenteditable/);
  assert.match(COOLTO_SYSTEM_PROMPT, /永远不点/);
  assert.match(COOLTO_SYSTEM_PROMPT, /应聘\[岗位名称\]/);
  assert.match(SYSTEM_PROMPT_VERSION, /^coolto-local-agent\/v\d+$/);
});
