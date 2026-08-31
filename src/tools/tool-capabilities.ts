import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ToolCapabilityMetadataV1 } from "../agent-task/tool-capability-types.js";

export type CapabilityAgentTool = AgentTool & {
  capability: ToolCapabilityMetadataV1;
};

const BROWSER_LIGHT_READ = new Set([
  "browser_list_tabs", "browser_get_active_tab",
]);
const BROWSER_CONTEXT_READ = new Set([
  "extract_page", "browser_wait_for", "browser_query_elements", "browser_snapshot",
]);
const BROWSER_CONTROL = new Set([
  "browser_new_tab", "browser_select_tab", "browser_close_tab",
  "browser_navigate", "browser_go_back", "browser_go_forward", "browser_reload",
]);
const BROWSER_WRITE = new Set([
  "browser_tag_elements", "browser_fill_field", "browser_select_option",
  "browser_set_checked", "browser_click_element", "browser_scroll_to",
  "browser_upload_file", "browser_keypress", "browser_hover", "browser_drag",
  "browser_upload_delivery_resume",
]);
const TASK_LIFECYCLE = new Set([
  "task_checkpoint", "task_wait", "task_need_user", "task_complete",
]);
const JOB_SCOUT_READ = new Set(["list_job_leads"]);
const JOB_SCOUT_WRITE = new Set([
  "fetch_job_source", "record_job_lead_evaluation",
]);

export function applyToolCapabilities(tools: AgentTool[]): CapabilityAgentTool[] {
  return tools.map((tool) => {
    const capability = capabilityFor(tool);
    return {
      ...tool,
      executionMode: capability.concurrency,
      capability,
    };
  });
}

export function requireToolCapability(tool: AgentTool): ToolCapabilityMetadataV1 {
  const capability = (tool as Partial<CapabilityAgentTool>).capability;
  if (!capability) throw new Error(`工具 ${tool.name} 缺少 capability metadata`);
  return structuredClone(capability);
}

function capabilityFor(tool: AgentTool): ToolCapabilityMetadataV1 {
  if (BROWSER_LIGHT_READ.has(tool.name)) return metadata({
    scope: "browser.read", read: true, fresh: false,
  });
  if (BROWSER_CONTEXT_READ.has(tool.name)) return metadata({
    scope: "browser.read", read: true, fresh: false, sequential: true,
  });
  if (BROWSER_CONTROL.has(tool.name)) return metadata({
    scope: "browser.control", fresh: false,
  });
  if (BROWSER_WRITE.has(tool.name)) return metadata({
    scope: "browser.write", fresh: true,
  });
  if (tool.name === "browser_download") return metadata({
    scope: "browser.download", fresh: true, reconcile: true,
  });
  if (tool.name === "request_write_access" || tool.name === "browser_start_review") {
    return metadata({
      scope: tool.name === "request_write_access"
        ? "browser.request_access" : "browser.review",
      fresh: false,
      unattendedAllowed: false,
    });
  }
  if (TASK_LIFECYCLE.has(tool.name)) {
    return {
      sideEffect: "reversible", risk: "R1", requiredScopes: ["task.lifecycle"],
      concurrency: "sequential", idempotency: "request_key", evidence: "none",
      requiresFreshObservation: false, unattendedAllowed: true,
    };
  }
  if (JOB_SCOUT_READ.has(tool.name)) return metadata({
    scope: "jobs.search", read: true, fresh: false,
  });
  if (JOB_SCOUT_WRITE.has(tool.name)) return metadata({
    scope: tool.name === "fetch_job_source" ? "jobs.search" : "jobs.evaluate",
    fresh: false, unattendedAllowed: true,
  });
  if (tool.name === "prepare_application_submission") return {
    sideEffect: "reversible", risk: "R1",
    requiredScopes: ["browser.submit", "tracker.application.create"],
    concurrency: "sequential", idempotency: "request_key", evidence: "none",
    requiresFreshObservation: true, unattendedAllowed: true,
  };
  if (tool.name === "browser_submit") return {
    sideEffect: "external_commitment", risk: "R2",
    requiredScopes: ["browser.submit", "tracker.application.create"],
    concurrency: "sequential", idempotency: "receipt_reconcile",
    evidence: "submission_receipt", requiresFreshObservation: true,
    unattendedAllowed: true,
  };
  if (tool.name === "sync_submission_receipt") return metadata({
    scope: "tracker.application.create", fresh: false, reconcile: true,
  });
  if (tool.name === "get_answer_vault") return metadata({
    scope: "answers.read", read: true, fresh: false,
  });
  if (tool.name === "prepare_answer_vault_entry") return {
    sideEffect: "reversible", risk: "R1", requiredScopes: ["answers.prepare"],
    concurrency: "sequential", idempotency: "request_key", evidence: "none",
    requiresFreshObservation: false, unattendedAllowed: true,
  };
  if (["fetch_inbox_events", "read_inbox_event", "list_inbox_signals"]
    .includes(tool.name)) return metadata({
      scope: "mail.read", read: true, fresh: false, sequential: true,
    });
  if (tool.name === "search_application_candidates") return metadata({
    scope: "tracker.application.read", read: true, fresh: false,
    sequential: true,
  });
  if (tool.name === "capture_browser_mail_event") return {
    sideEffect: "reversible", risk: "R1",
    requiredScopes: ["browser.read", "mail.read"],
    concurrency: "sequential", idempotency: "request_key", evidence: "none",
    requiresFreshObservation: false, unattendedAllowed: true,
  };
  if (tool.name === "record_inbox_signal") return metadata({
    scope: "mail.classify", fresh: false, unattendedAllowed: true,
  });
  if (tool.name === "prepare_inbox_application_update") return {
    sideEffect: "reversible", risk: "R1",
    requiredScopes: ["tracker.application.update"],
    concurrency: "sequential", idempotency: "request_key", evidence: "none",
    requiresFreshObservation: false, unattendedAllowed: true,
  };
  if (tool.name === "prepare_inbox_interview_update") return {
    sideEffect: "reversible", risk: "R1",
    requiredScopes: ["tracker.interview.update"],
    concurrency: "sequential", idempotency: "request_key", evidence: "none",
    requiresFreshObservation: false, unattendedAllowed: true,
  };
  if (tool.name === "find_resume_reuse_candidates") return metadata({
    scope: "resume.read", read: true, fresh: false,
  });
  if (tool.name === "list_delivery_resume_files") return metadata({
    scope: "delivery_resume_file.read", read: true, fresh: false,
  });
  if (tool.name === "select_delivery_resume_file") return metadata({
    scope: "delivery_resume_file.select", fresh: false,
  });
  if (tool.name === "save_selected_file_as_delivery_resume") return metadata({
    scope: "delivery_resume_file.create", fresh: false,
  });
  const sequential = tool.executionMode === "sequential";
  return metadata({
    scope: `app.tool.${tool.name}`,
    read: !sequential,
    fresh: false,
    unattendedAllowed: !sequential,
  });
}

function metadata(input: {
  scope: string;
  read?: boolean;
  fresh: boolean;
  reconcile?: boolean;
  unattendedAllowed?: boolean;
  sequential?: boolean;
}): ToolCapabilityMetadataV1 {
  const read = input.read ?? false;
  return {
    sideEffect: read ? "read" : "reversible",
    risk: read ? "R0" : "R1",
    requiredScopes: [input.scope],
    concurrency: input.sequential || !read ? "sequential" : "parallel",
    idempotency: input.reconcile ? "receipt_reconcile" : read ? "none" : "request_key",
    evidence: read ? "none" : "action_receipt",
    requiresFreshObservation: input.fresh,
    unattendedAllowed: input.unattendedAllowed ?? true,
  };
}
