import {
  RESUME_GLOBAL_MINIMUM_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
  type ResumeCompileResult,
} from "../compiler-types.js";

export interface ResumeBulletLinePlan {
  plannedLines: number;
  lockedLines?: number;
}

export type ResumeBulletLinePlans = Record<string, ResumeBulletLinePlan>;

export function plannedBulletLines(value: number | undefined): number {
  return Number.isInteger(value) && (value ?? 0) >= 1 ? value! : 1;
}

export function layoutCanLockBulletLines(result: ResumeCompileResult): boolean {
  return result.pageCount === 1 &&
    result.overflowPx <= RESUME_LAYOUT_TOLERANCE_PX &&
    result.usedHeightPx + RESUME_LAYOUT_TOLERANCE_PX >=
      result.availableHeightPx * RESUME_GLOBAL_MINIMUM_USAGE_RATIO;
}

export function lockMeasuredBulletLines(
  plans: ResumeBulletLinePlans,
  result: ResumeCompileResult,
): ResumeBulletLinePlans {
  if (!layoutCanLockBulletLines(result)) return plans;
  const measured = new Map(
    result.bullets.map((bullet) => [bullet.bulletId, bullet.lineCount]),
  );
  return Object.fromEntries(Object.entries(plans).map(([bulletId, plan]) => {
    const lineCount = measured.get(bulletId);
    return [bulletId, {
      ...plan,
      ...(lineCount && lineCount >= 1 ? { lockedLines: lineCount } : {}),
    }];
  }));
}
