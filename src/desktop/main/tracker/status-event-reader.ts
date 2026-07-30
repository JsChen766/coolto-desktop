import type { ApplicationStatusEvent } from "../../../tracker/child-types.js";
import { APPLICATION_STATUSES, type ApplicationStatus } from "../../../tracker/types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import { dateString, enumValue, nullableString, requiredString } from "./tracker-mapping-utils.js";

export class StatusEventReader {
  public constructor(
    private readonly store: Pick<LocalSyncStore, "listEntities">,
    private readonly initialSync: () => Promise<void>,
  ) {}

  public async list(applicationId?: string): Promise<ApplicationStatusEvent[]> {
    await this.initialSync();
    return this.store.listEntities("application_status_event")
      .filter((entity) => entity.operation !== "delete" && (
        !applicationId || entity.payload.applicationId === applicationId
      ))
      .map((entity) => {
        const value = entity.payload;
        return {
          id: requiredString(value.id, "statusEvent.id"),
          applicationId: requiredString(value.applicationId, "statusEvent.applicationId"),
          fromStatus: value.fromStatus == null ? null : status(value.fromStatus),
          toStatus: status(value.toStatus), reason: nullableString(value.reason, "statusEvent.reason"),
          occurredAt: dateString(value.occurredAt, "statusEvent.occurredAt"),
          operationId: requiredString(value.operationId, "statusEvent.operationId"),
          createdAt: dateString(value.createdAt, "statusEvent.createdAt"),
        };
      }).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  }
}

function status(value: unknown): ApplicationStatus {
  return enumValue(value, APPLICATION_STATUSES, "statusEvent.status");
}
