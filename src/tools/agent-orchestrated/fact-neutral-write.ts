import { proposeFactNeutralFragment } from
  "../../resume/workspace/fact-neutral-fragments.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import type { ApplyResumeContentParameters } from "./apply-content-parameters.js";
import type { ResumeFactNeutralFragment } from
  "../../resume/workspace/fact-neutral-types.js";

export function mergeFactNeutralFragments(
  ...groups: Array<readonly ResumeFactNeutralFragment[] | undefined>
): ResumeFactNeutralFragment[] {
  return groups.flatMap((group) => group ?? []);
}

export function factNeutralFragmentsForWrite(
  workspace: ResumeWorkspace,
  params: ApplyResumeContentParameters,
  updates: readonly { bulletId: string; text: string }[] | undefined,
  pageFillAttempt: boolean,
) {
  const usesFactNeutral = [
    ...(params.tailGrowths ?? []),
    ...(params.lineExpansions ?? []),
    ...(params.lineRewrites ?? []),
  ].some((entry) => entry.contentMode === "fact_neutral");
  if (!usesFactNeutral || !updates) return undefined;
  const purpose = pageFillAttempt ? "page_fill" as const : "tail_fill" as const;
  return updates.map((update) => proposeFactNeutralFragment({
    workspace,
    bulletId: update.bulletId,
    appliedText: update.text,
    purpose,
  }));
}

export function safeFactNeutralFragmentsForWrite(
  ...input: Parameters<typeof factNeutralFragmentsForWrite>
): { fragments?: ReturnType<typeof factNeutralFragmentsForWrite>; error?: string } {
  try {
    return { fragments: factNeutralFragmentsForWrite(...input) };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
