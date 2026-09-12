import { canonicalHash } from "../../../agent-task/canonical-hash.js";
import type { ApplicationCreateInput } from "../../../tracker/types.js";

export function createApplicationInput(value: {
  jdId: string; resumeId: string; company: string; role: string; targetUrl: string;
}): ApplicationCreateInput {
  return {
    jdId: value.jdId, resumeId: value.resumeId,
    companyName: value.company, roleName: value.role,
    deliveryMethod: "form_fill", targetUrl: value.targetUrl,
    appliedAt: new Date().toISOString(),
    pendingConfirmation: false,
    source: "browser",
    dedupeKey: canonicalHash({
      jdId: value.jdId, resumeId: value.resumeId, targetUrl: value.targetUrl,
    }),
  };
}
