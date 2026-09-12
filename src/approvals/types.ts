export type ActionRisk =
  | "write"
  | "sensitive"
  | "destructive"
  | "external";

export interface ApprovalPreviewField {
  label: string;
  value: string;
}

export interface ApprovalPreviewItem {
  id?: string;
  title: string;
  description?: string;
  fields?: ApprovalPreviewField[];
  warning?: string;
}

export interface ApprovalPreviewProfileField {
  field: string;
  label: string;
  currentValue: string | null;
  proposedValue: string;
  selectedByDefault: boolean;
  confidence: "high" | "low";
}

export interface ApprovalPreviewPreference {
  action: "create" | "update" | "disable" | "enable" | "delete" | "reapply" | "accept_server";
  key: string;
  currentValue: string;
  proposedValue: string;
  scope: string;
  priority: number | null;
  source: string | null;
  explanation: string;
}

export interface ApprovalPreview {
  summary: ApprovalPreviewField[];
  items?: ApprovalPreviewItem[];
  profileFields?: ApprovalPreviewProfileField[];
  preference?: ApprovalPreviewPreference;
  warnings?: string[];
}

export interface ApprovalDraft {
  actionType: string;
  scopeKey: string;
  risk: ActionRisk;
  title: string;
  description: string;
  preview: ApprovalPreview;
}

export interface ApprovalRequest
  extends Omit<ApprovalDraft, "scopeKey"> {
  id: string;
  payloadHash: string;
  createdAt: string;
}

export type ApprovalDecision =
  | { type: "accept"; selection?: unknown }
  | { type: "reject" }
  | { type: "custom"; text: string };

export interface ApprovalExecutionResult {
  summary: string;
  details?: unknown;
  nextApproval?: {
    draft: ApprovalDraft;
    payload: unknown;
  };
}

export type ApprovalEvent =
  | { type: "approval.required"; request: ApprovalRequest }
  | {
      type: "approval.resolved";
      requestId: string;
      decision: ApprovalDecision["type"] | "replaced";
    }
  | { type: "approval.executing"; requestId: string }
  | {
      type: "approval.completed";
      requestId: string;
      summary: string;
      details?: unknown;
    }
  | {
      type: "approval.failed";
      requestId: string;
      message: string;
    };
