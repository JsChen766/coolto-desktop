export const segmentViewTween = {
  type: "tween" as const,
  duration: 0.18,
  ease: [0.25, 1, 0.5, 1] as const,
};

export const TRACKER_VIEW_ORDER = ["board", "timeline", "calendar"] as const;
export const REPOSITORY_VIEW_ORDER = ["jobs", "resumes"] as const;

export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function viewSlideDirection<T extends string>(
  order: readonly T[],
  from: T,
  to: T,
): number {
  const previous = order.indexOf(from);
  const next = order.indexOf(to);
  if (previous < 0 || next < 0 || previous === next) return 0;
  return next > previous ? 1 : -1;
}

export function viewSlideVariants(reduced: boolean, distance = 28) {
  const offset = reduced ? 0 : distance;
  return {
    enter: (direction: number) => ({
      x: direction > 0 ? offset : direction < 0 ? -offset : 0,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({
      x: direction > 0 ? -offset : direction < 0 ? offset : 0,
      opacity: 0,
    }),
  };
}
