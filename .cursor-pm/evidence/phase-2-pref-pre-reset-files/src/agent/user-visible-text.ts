const INTERNAL_TOOL_NAMES = new Set([
  "add_resume_material", "apply_resume_content", "create_resume_workspace",
  "decline_resume_material", "get_resume_workspace", "pause_resume_for_material",
  "prepare_experience_sync", "task_checkpoint", "task_complete", "task_need_user",
  "task_wait", "get_answer_vault", "prepare_answer_vault_entry", "browser_submit",
  "prepare_application_submission", "sync_submission_receipt", "browser_click_element",
  "browser_download", "browser_fill_field", "browser_drag", "browser_hover",
  "browser_keypress", "browser_go_back", "browser_go_forward", "browser_navigate",
  "browser_reload", "browser_query_elements", "browser_snapshot", "browser_wait_for",
  "browser_scroll_to", "browser_select_option", "browser_set_checked",
  "browser_start_review", "browser_close_tab", "browser_get_active_tab",
  "browser_list_tabs", "browser_new_tab", "browser_select_tab", "browser_tag_elements",
  "browser_upload_file", "request_write_access", "extract_page", "get_current_user",
  "get_experience", "get_user_profile", "prepare_experience_import",
  "prepare_inbox_application_update", "prepare_inbox_interview_update",
  "capture_browser_mail_event", "fetch_inbox_events", "list_inbox_signals",
  "read_inbox_event", "record_inbox_signal", "get_jd", "search_jds",
  "fetch_job_source", "list_job_leads", "record_job_lead_evaluation",
  "prepare_agent_task", "prepare_jd_import", "prepare_match_analysis",
  "prepare_profile_update", "get_preferences", "resolve_preferences",
  "prepare_preference_change", "get_resume", "list_resumes", "get_runtime_info",
  "search_experiences", "list_selected_files", "parse_selected_file", "sync_now",
]);

const TOOL_PATTERN = new RegExp(
  `\\b(?:${[...INTERNAL_TOOL_NAMES].join("|")})\\b`,
  "gu",
);
const INTERNAL_FIELD_PATTERN = /\b(?:artifactId|callId|candidateId|conversationId|experienceId|jdId|proposalId|requestId|runId|taskId|toolCallId)\b/gu;
const CALL_PATTERN = /\bcall_[A-Za-z0-9_-]{8,}\b/gu;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
const HASH_PATTERN = /\b[0-9a-f]{32,128}\b/giu;

export function presentAssistantText(value: string): string {
  return value
    .replace(TOOL_PATTERN, "内部操作")
    .replace(INTERNAL_FIELD_PATTERN, "内部记录")
    .replace(CALL_PATTERN, "内部调用")
    .replace(UUID_PATTERN, "内部记录")
    .replace(HASH_PATTERN, "内部校验值");
}

export function appendVisibleAssistantDelta(
  current: string,
  delta: string,
): string {
  return presentAssistantText(current + delta);
}
