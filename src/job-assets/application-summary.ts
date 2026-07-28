import { APPLICATION_STATUSES } from "../tracker/types.js";
import type {
  ApplicationStatusCounts,
  ApplicationSummary,
  JobAssetApplication,
  LatestApplicationSummary,
} from "./types.js";

export function summarizeApplications(
  applications: readonly JobAssetApplication[],
): ApplicationSummary {
  const statusCounts = emptyStatusCounts();
  let latest: LatestApplicationSummary | null = null;

  for (const application of applications) {
    statusCounts[application.status] += 1;
    const candidate = latestSummary(application);
    if (isLater(candidate, latest)) latest = candidate;
  }

  return { total: applications.length, statusCounts, latest };
}

function emptyStatusCounts(): Record<keyof ApplicationStatusCounts, number> {
  return Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<keyof ApplicationStatusCounts, number>;
}

function latestSummary(
  application: JobAssetApplication,
): LatestApplicationSummary {
  return {
    id: application.id,
    status: application.status,
    occurredAt: application.appliedAt || application.createdAt,
  };
}

function isLater(
  candidate: LatestApplicationSummary,
  current: LatestApplicationSummary | null,
): boolean {
  if (!current) return true;
  if (candidate.occurredAt !== current.occurredAt) {
    return candidate.occurredAt > current.occurredAt;
  }
  return candidate.id > current.id;
}
