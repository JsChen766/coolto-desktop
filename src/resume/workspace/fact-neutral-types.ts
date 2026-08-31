export interface ResumeFactNeutralAuthorization {
  sourceRequestKind:
    | "agent_declared"
    | "critical_skill"
    | "bullet_count_insufficient"
    | "page_fill_stalled"
    | "line_rewrite_stalled"
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
