import type { ResumeGenerationBlocker } from
  "./generation-readiness-types.js";
import type { ResumeBulletOrigin } from "./item-content-types.js";
import type { ResumeWorkspace } from "./types.js";

export function validatedBulletWorkUnitIds(input: {
  workspace: ResumeWorkspace;
  itemId: string;
  origin: ResumeBulletOrigin;
  evidenceIds: readonly string[];
  workUnitIds?: readonly string[];
}): string[] | undefined {
  const requested = [...new Set(
    (input.workUnitIds ?? []).map((id) => id.trim()).filter(Boolean),
  )];
  if (input.origin === "agent_augmented") {
    if (requested.length) throw new Error("agent_augmented bullet 不得绑定 WorkUnit");
    return undefined;
  }
  if (input.workspace.workUnitMap?.status !== "ready") {
    return requested.length ? requested : undefined;
  }
  const units = input.workspace.workUnitMap.units.filter(
    (unit) => unit.itemId === input.itemId,
  );
  if (!requested.length) throw new Error("grounded bullet 必须绑定完整 WorkUnit");
  const byId = new Map(units.map((unit) => [unit.workUnitId, unit]));
  const unknown = requested.filter((id) => !byId.has(id));
  if (unknown.length) {
    throw new Error(`bullet 绑定了不属于当前 item 的 WorkUnit：${unknown.join(",")}`);
  }
  const expected = new Set(requested.flatMap((id) => byId.get(id)!.evidenceIds));
  const mapped = new Set(units.flatMap((unit) => unit.evidenceIds));
  const actual = new Set(input.evidenceIds.filter((id) => mapped.has(id)));
  const missing = [...expected].filter((id) => !actual.has(id));
  const outside = [...actual].filter((id) => !expected.has(id));
  if (missing.length || outside.length) {
    throw new Error([
      "bullet 必须完整引用所绑定 WorkUnit 的 evidence",
      `missing=${missing.join(",") || "none"}`,
      `outside=${outside.join(",") || "none"}`,
    ].join("；"));
  }
  return requested;
}

export function assertWorkUnitsUnused(
  workUnitIds: readonly string[] | undefined,
  used: ReadonlySet<string>,
): void {
  const duplicate = workUnitIds?.find((id) => used.has(id));
  if (duplicate) throw new Error(`同一 WorkUnit 不能拆到多条 bullet：${duplicate}`);
}

export function workUnitReadinessBlockers(
  workspace: ResumeWorkspace,
): ResumeGenerationBlocker[] {
  if (workspace.workUnitMap?.status !== "ready") return [];
  const blockers: ResumeGenerationBlocker[] = [];
  const provenance = new Map(
    (workspace.bulletProvenance ?? []).map((entry) => [entry.bulletId, entry]),
  );
  const used = new Set<string>();
  for (const section of workspace.structure.sections) {
    for (const item of section.items) {
      if (!workspace.itemTiers?.[item.id]) continue;
      for (const bullet of item.bullets) {
        const source = provenance.get(bullet.id);
        try {
          const ids = validatedBulletWorkUnitIds({
            workspace, itemId: item.id,
            origin: source?.origin ?? "grounded",
            evidenceIds: source?.evidenceIds ?? [],
            ...(source?.workUnitIds
              ? { workUnitIds: source.workUnitIds } : {}),
          });
          assertWorkUnitsUnused(ids, used);
          ids?.forEach((id) => used.add(id));
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          blockers.push({
            code: blockerCode(message), message,
            itemId: item.id, bulletId: bullet.id,
          });
        }
      }
    }
  }
  return blockers;
}

function blockerCode(message: string): ResumeGenerationBlocker["code"] {
  if (message.includes("拆到多条")) return "work_unit_split_across_bullets";
  if (message.includes("完整引用") || message.includes("不属于当前")) {
    return "evidence_outside_work_unit";
  }
  return "work_unit_ownership_missing";
}
