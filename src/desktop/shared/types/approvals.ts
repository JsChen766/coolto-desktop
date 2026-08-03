import type { JdArtifactData, MatchReportArtifactData } from "./artifacts.js";
import type { BrowserFillRecordView } from "./browser.js";

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

export interface DesktopApprovalRequest {
  id: string;
  actionType: string;
  risk: "write" | "sensitive" | "destructive" | "external";
  title: string;
  description: string;
  preview: {
    summary: ApprovalPreviewField[];
    items?: ApprovalPreviewItem[];
    profileFields?: ApprovalPreviewProfileField[];
    warnings?: string[];
  };
  createdAt: string;
}

export type DesktopApprovalDecision =
  | { type: "accept"; selection?: {
    profileFields?: Array<{ field: string; value: string }>;
    candidateIds?: string[];
  } }
  | { type: "reject" }
  | { type: "custom"; text: string };

export type DesktopAgentEvent =
  | { type: "run.started" }
  | { type: "message.delta"; text: string }
  | { type: "tool.started"; callId: string; name: string; arguments: unknown }
  | { type: "tool.completed"; callId: string; name: string; isError: boolean }
  | { type: "run.failed"; message: string }
  | { type: "run.completed" }
  | { type: "resume.draft.updated"; artifactId: string }
  | { type: "approval.required"; request: DesktopApprovalRequest }
  | {
      type: "approval.resolved";
      requestId: string;
      decision: "accept" | "reject" | "custom" | "replaced";
    }
  | { type: "approval.executing"; requestId: string }
  | { type: "approval.completed"; requestId: string; summary: string; details?: unknown }
  | { type: "approval.failed"; requestId: string; message: string }
  | { type: "jd.proposal.created"; data: JdArtifactData }
  | { type: "jd.saved"; approvalRequestId: string; jdId: string }
  | { type: "match.report.created"; data: MatchReportArtifactData }
  | { type: "browser.fill.progress"; records: BrowserFillRecordView[]; reviewing: boolean }
  | { type: "browser.review.decision"; fillId: string; decision: "accepted" | "rejected" }
  | {
      type: "browser.review.complete";
      action: "accepted" | "rejected" | "mixed";
      acceptedCount: number;
      rejectedCount: number;
    }
  | {
      type: "browser.captcha.detected";
      kind: "recaptcha" | "hcaptcha" | "geetest" | "slider" | "image" | "unknown";
      detail?: string;
    };
