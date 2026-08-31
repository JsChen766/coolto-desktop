import type { ApplicationRecord, ApplicationStatus } from "../../../tracker/types.js";

const STATUSES: ApplicationStatus[] = [
  "applied", "screening", "interviewing", "offer", "rejected", "no_response",
];

export function buildApplicationStrategySnapshot(applications: ApplicationRecord[]) {
  return {
    total: applications.length,
    statusCounts: Object.fromEntries(STATUSES.map((status) => [
      status, applications.filter((item) => item.status === status).length,
    ])),
    distinctResumes: new Set(applications.map((item) => item.resumeId).filter(Boolean)).size,
    sources: groupedOutcomes(applications, sourceKey),
    resumeVersions: groupedOutcomes(applications, resumeVersionKey),
    cadenceByWeek: cadence(applications),
    limitations: [
      "历史 Application 未统一保存 BrowserLead match score；当前不比较匹配分与后续结果。",
    ],
  };
}

function groupedOutcomes(
  applications: ApplicationRecord[],
  keyOf: (application: ApplicationRecord) => string,
) {
  const values = new Map<string, ApplicationRecord[]>();
  for (const application of applications) {
    const key = keyOf(application);
    values.set(key, [...(values.get(key) ?? []), application]);
  }
  return [...values].sort(([left], [right]) => left.localeCompare(right)).map(([key, items]) => ({
    key, total: items.length,
    responded: items.filter((item) => item.status !== "applied" && item.status !== "no_response").length,
    interviews: items.filter((item) => ["interviewing", "offer"].includes(item.status)).length,
    offers: items.filter((item) => item.status === "offer").length,
    rejected: items.filter((item) => item.status === "rejected").length,
  }));
}

function sourceKey(application: ApplicationRecord): string {
  if (application.targetUrl) {
    try { return new URL(application.targetUrl).hostname.toLowerCase(); }
    catch { /* Use the normalized source fallback. */ }
  }
  return application.source;
}

function resumeVersionKey(application: ApplicationRecord): string {
  const title = application.resumeTitleSnapshot ?? "未关联 Resume";
  const version = application.resumeContentHashSnapshot?.slice(0, 12) ?? "未冻结版本";
  return `${title} · ${version}`;
}

function cadence(applications: ApplicationRecord[]) {
  const counts = new Map<string, number>();
  for (const application of applications) {
    const value = Date.parse(application.appliedAt ?? application.createdAt);
    if (!Number.isFinite(value)) continue;
    const date = new Date(value);
    const day = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - day);
    const week = date.toISOString().slice(0, 10);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, applications]) => ({ weekStart, applications }));
}
