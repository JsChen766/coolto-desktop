import type {
  ResumeMaterialRequest,
  ResumeMaterialRequestResolution,
  ResumeMaterialRequestStatus,
} from "./material-request-types.js";
import type { ResumeWorkspace } from "./types.js";

export type {
  ResumeMaterialRequest,
  ResumeMaterialRequestKind,
  ResumeMaterialRequestResolution,
  ResumeMaterialRequestStatus,
} from "./material-request-types.js";

type MaterialRequestInput = Omit<
  ResumeMaterialRequest,
  "id" | "requestedAt" | "status" | "respondedAt" | "sourceMessageTimestamp"
>;

export function createResumeMaterialRequest(
  workspace: Pick<ResumeWorkspace, "candidateId" | "materialRequest">,
  input: MaterialRequestInput,
): ResumeMaterialRequest {
  const id = resumeMaterialRequestId(workspace.candidateId, input);
  const previous = workspace.materialRequest;
  if (previous && effectiveResumeMaterialRequestId(workspace.candidateId, previous) === id) {
    return { ...previous, ...input, id, status: previous.status ?? "awaiting_response" };
  }
  return {
    ...input,
    id,
    status: "awaiting_response",
    requestedAt: new Date().toISOString(),
  };
}

export function normalizeResumeMaterialRequest(
  candidateId: string,
  request: ResumeMaterialRequest,
): ResumeMaterialRequest & { id: string; status: ResumeMaterialRequestStatus } {
  return {
    ...request,
    id: effectiveResumeMaterialRequestId(candidateId, request),
    status: request.status ?? "awaiting_response",
  };
}

export function effectiveResumeMaterialRequestId(
  candidateId: string,
  request: ResumeMaterialRequest,
): string {
  return request.id ?? resumeMaterialRequestId(candidateId, request);
}

function resumeMaterialRequestId(
  candidateId: string,
  request: MaterialRequestInput,
): string {
  const value = [
    candidateId,
    request.kind ?? "agent_declared",
    request.targetExperienceId ?? "",
    request.reason.trim(),
    request.question.trim(),
  ].join("\0");
  const digest = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b]
    .map((seed) => hash32(value, seed))
    .join("");
  return `resume-material:${digest}`;
}

function hash32(value: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
