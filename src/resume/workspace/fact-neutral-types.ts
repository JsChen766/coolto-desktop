export interface ResumeFactNeutralAuthorization {
  sourceRequestKind:
    | "agent_declared"
    | "page_fill_stalled"
    | "tail_repair_stalled";
  confirmedAt: string;
  confirmedMessageTimestamp: number;
}

export interface ResumeFactNeutralFragment {
  bulletId: string;
  baseText: string;
  fragmentText: string;
  appliedText: string;
  purpose: "page_fill" | "tail_fill";
  createdAt: string;
}
