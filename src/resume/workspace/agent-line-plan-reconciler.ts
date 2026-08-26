import type { ResumeBulletLinePlans } from "./bullet-line-plan.js";

interface BuiltBulletPlan {
  bullet: { id: string };
  plannedLines: number;
}

export function removeBulletLinePlans(
  plans: ResumeBulletLinePlans,
  bulletIds: Iterable<string>,
): void {
  for (const bulletId of bulletIds) delete plans[bulletId];
}

export function replaceBulletLinePlans(input: {
  plans: ResumeBulletLinePlans;
  previous: ResumeBulletLinePlans | undefined;
  oldBulletIds: Iterable<string>;
  built: readonly BuiltBulletPlan[];
}): void {
  removeBulletLinePlans(input.plans, input.oldBulletIds);
  for (const entry of input.built) {
    const lockedLines = input.previous?.[entry.bullet.id]?.lockedLines;
    input.plans[entry.bullet.id] = {
      plannedLines: entry.plannedLines,
      ...(lockedLines ? { lockedLines } : {}),
    };
  }
}
