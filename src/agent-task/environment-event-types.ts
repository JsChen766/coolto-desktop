export interface EnvironmentEventV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  source: "timer" | "approval" | "mail" | "calendar" | "browser" | "user" | "system";
  type: string;
  trust: "trusted_system" | "external_untrusted";
  occurredAt: string;
  receivedAt: string;
  dedupeKey: string;
  payloadRef: string | null;
  payloadHash: string;
  status: "pending" | "delivered" | "acknowledged" | "dead_letter";
  deliveryAttempts: number;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
}
