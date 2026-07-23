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
  title: string;
  description?: string;
  fields?: ApprovalPreviewField[];
  warning?: string;
}

export interface ApprovalPreview {
  summary: ApprovalPreviewField[];
  items?: ApprovalPreviewItem[];
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
  | { type: "accept" }
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
