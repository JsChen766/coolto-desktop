import { createHash } from "node:crypto";

import type { LocalResumeDraft } from "../../../resume/draft/types.js";
import type { ResumeExperienceSyncDraftPort } from
  "../../../resume/material/experience-sync-port.js";
import type { ExperienceMaterialCommitter } from
  "../../../experience/material-ingestion-types.js";

export async function syncDraftSupplementalMaterial(input: {
  draft: LocalResumeDraft;
  drafts: ResumeExperienceSyncDraftPort;
  committer: ExperienceMaterialCommitter;
}): Promise<LocalResumeDraft> {
  const { draft, drafts } = input;
  const evidenceFingerprint = supplementalFingerprint(draft);
  if (!evidenceFingerprint ||
    draft.experienceSync?.evidenceFingerprint === evidenceFingerprint) {
    return draft;
  }
  try {
    const groups = Map.groupBy(
      draft.workspace.supplementalEvidence ?? [],
      (item) => item.experienceId,
    );
    for (const [experienceId, items] of groups) {
      const text = items.map((item) => item.text.trim()).filter(Boolean).join("\n");
      if (!text) continue;
      await input.committer.commit({
        target: { kind: "existing", experienceId },
        sourceHash: createHash("sha256")
          .update(`${draft.artifactId}\0${experienceId}\0${text}`)
          .digest("hex"),
        sourceLabel: "对话补充材料",
        capturedAt: new Date().toISOString(),
        numberCount: 0,
        criticalOutputCount: 0,
        sections: [{ label: "用户补充", text }],
      });
    }
  } catch {
    return drafts.markExperienceSync(draft.artifactId, {
      evidenceFingerprint,
      status: "stale",
      updatedAt: new Date().toISOString(),
    });
  }
  return drafts.markExperienceSync(draft.artifactId, {
    evidenceFingerprint,
    status: "accepted",
    updatedAt: new Date().toISOString(),
  });
}

function supplementalFingerprint(draft: LocalResumeDraft): string | undefined {
  const values = (draft.workspace.supplementalEvidence ?? [])
    .map((item) => `${item.evidenceId}\0${item.experienceId}\0${item.text}`)
    .sort();
  return values.length
    ? createHash("sha256").update(values.join("\n")).digest("hex")
    : undefined;
}
