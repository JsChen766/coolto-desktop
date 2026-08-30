import type { JsonValue } from "./json-types.js";

export interface AgentEvidenceV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  runId: string;
  kind: "browser_observation" | "connector_payload";
  payloadHash: string;
  payload: JsonValue;
  createdAt: string;
  expiresAt: string;
}

export interface AgentEvidenceStore {
  save(input: Omit<AgentEvidenceV1, "version" | "id" | "ownerId">): Promise<AgentEvidenceV1>;
  read(evidenceId: string): Promise<AgentEvidenceV1 | undefined>;
  clearExpired(now?: number): Promise<number>;
  clearAll(): Promise<void>;
}
