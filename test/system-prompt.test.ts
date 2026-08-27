import assert from "node:assert/strict";
import test from "node:test";

import {
  COOLTO_SYSTEM_PROMPT,
  SYSTEM_PROMPT_VERSION,
} from "../src/agent/system-prompt.js";

test("system prompt plans dynamic bullet lines and uses component expansion", () => {
  assert.equal(SYSTEM_PROMPT_VERSION, "coolto-local-agent/v131");
  assert.match(COOLTO_SYSTEM_PROMPT, /用户当前最新、明确的指令具有最高执行优先级/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /信息不足但仍可安全、可逆执行/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /不得换一种说法继续索取相同信息/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /所有语义判断/);
  assert.match(COOLTO_SYSTEM_PROMPT, /create_resume_workspace/);
  assert.match(COOLTO_SYSTEM_PROMPT, /apply_resume_content/);
  assert.match(COOLTO_SYSTEM_PROMPT, /main 至少 3 条/);
  assert.match(COOLTO_SYSTEM_PROMPT, /secondary 至少 2 条/);
  assert.match(COOLTO_SYSTEM_PROMPT, /plannedLines/);
  assert.match(COOLTO_SYSTEM_PROMPT, /行数也没有固定上限/);
  assert.match(COOLTO_SYSTEM_PROMPT, /JD 匹配度、经历重要性和证据深度/);
  assert.match(COOLTO_SYSTEM_PROMPT, /最后一行约 82%/);
  assert.match(COOLTO_SYSTEM_PROMPT, /lineExpansions/);
  assert.match(COOLTO_SYSTEM_PROMPT, /三分之二实测门槛/);
  assert.match(COOLTO_SYSTEM_PROMPT, /batch_tail_rewrite/);
  assert.match(COOLTO_SYSTEM_PROMPT, /一次 tailRewrites/);
  assert.match(COOLTO_SYSTEM_PROMPT, /完整 revisedText/);
  assert.match(COOLTO_SYSTEM_PROMPT, /调整语序/);
  assert.match(COOLTO_SYSTEM_PROMPT, /每批最多 4 条/);
  assert.match(COOLTO_SYSTEM_PROMPT, /1–3 个/u);
  assert.doesNotMatch(COOLTO_SYSTEM_PROMPT, /3–6 个/u);
  assert.doesNotMatch(COOLTO_SYSTEM_PROMPT, /新的消息中明确表示/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /用户补充事实时/u);
  assert.doesNotMatch(COOLTO_SYSTEM_PROMPT, /batch_tail_reflow/);
  assert.match(COOLTO_SYSTEM_PROMPT, /confirm_no_resume_material/);
  assert.match(COOLTO_SYSTEM_PROMPT, /integrate_supplemental_evidence/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /同一查询最多调用一次/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /同名重复记录/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /contentMode=fact_neutral/);
  assert.match(COOLTO_SYSTEM_PROMPT, /不要先询问用户是否同步/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /全部可核验的具体事实/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /无论简历是否已经达标/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /经历仓库同步确认卡/u);
  assert.doesNotMatch(COOLTO_SYSTEM_PROMPT, /repair_bullet_depth/);
  assert.doesNotMatch(COOLTO_SYSTEM_PROMPT, /tailExpansions/);
  assert.match(COOLTO_SYSTEM_PROMPT, /保存和导出不是 Agent 行为/);
  assert.match(COOLTO_SYSTEM_PROMPT, /find_resume_reuse_candidates/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /baseResumeId/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /requestId/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /decline_resume_material/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /browser_start_review/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /browser_list_tabs/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /browser_snapshot/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /browser_download/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /prepare_agent_task/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /优先从当前消息和对话上下文推导/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /用户明确要求假设、模拟或合理补充/u);
  assert.match(COOLTO_SYSTEM_PROMPT, /SubmissionReceipt/u);
  assert.match(SYSTEM_PROMPT_VERSION, /^coolto-local-agent\/v\d+$/);
});
