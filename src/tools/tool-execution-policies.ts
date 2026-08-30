import type { AgentTool } from "@earendil-works/pi-agent-core";

const SEQUENTIAL_TOOL_NAMES = new Set([
  "sync_now", "prepare_profile_update", "prepare_experience_import",
  "prepare_jd_import", "prepare_match_analysis", "create_resume_workspace",
  "pause_resume_for_material", "apply_resume_content", "add_resume_material",
  "decline_resume_material", "prepare_experience_sync", "prepare_agent_task",
  "browser_click_element", "browser_fill_field", "browser_select_option",
  "browser_set_checked", "browser_upload_file", "browser_start_review",
  "browser_upload_delivery_resume", "select_delivery_resume_file",
  "save_selected_file_as_delivery_resume",
  "request_write_access", "browser_new_tab", "browser_select_tab",
  "browser_close_tab", "browser_navigate", "browser_go_back",
  "browser_go_forward", "browser_reload", "browser_wait_for",
  "browser_query_elements", "browser_snapshot", "browser_keypress",
  "browser_hover", "browser_drag", "browser_download", "task_checkpoint",
  "task_wait", "task_need_user", "task_complete",
  "fetch_job_source", "record_job_lead_evaluation",
  "prepare_application_submission", "browser_submit",
  "sync_submission_receipt",
  "prepare_answer_vault_entry",
  "fetch_inbox_events", "read_inbox_event", "record_inbox_signal",
  "capture_browser_mail_event",
  "prepare_inbox_application_update",
  "prepare_inbox_interview_update",
]);

export function applyExecutionPolicies(tools: AgentTool[]): AgentTool[] {
  return tools.map((tool) =>
    SEQUENTIAL_TOOL_NAMES.has(tool.name)
      ? { ...tool, executionMode: "sequential" }
      : tool,
  );
}
