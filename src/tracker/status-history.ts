import type { ApplicationStatusEvent } from "./child-types.js";
import type { ApplicationRecord } from "./types.js";

export function statusHistoryConsistent(
  application: ApplicationRecord,
  events: ApplicationStatusEvent[],
): boolean {
  if (application.syncStatus !== "clean") return true;
  const latest = [...events]
    .filter((event) => event.applicationId === application.id)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) ||
      right.id.localeCompare(left.id))[0];
  return (latest?.toStatus ?? "applied") === application.status;
}

