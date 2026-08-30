import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  readonly,
  shallowRef,
  watch,
  type WatchSource,
} from "vue";
import { shouldShowBrowserTabOverflow } from "../../../../browser/browser-tab-roving.js";

type ElementRef = Readonly<{ value: HTMLElement | null }>;
export type TabScrollDirection = "previous" | "next";

export function useTabStripOverflow(input: {
  viewport: ElementRef;
  track: ElementRef;
  itemCount: WatchSource<number>;
}) {
  const hasOverflow = shallowRef(false);
  const canScrollPrevious = shallowRef(false);
  const canScrollNext = shallowRef(false);
  let frame = 0;
  let observer: ResizeObserver | undefined;

  function measure(): void {
    frame = 0;
    const viewport = input.viewport.value;
    if (!viewport) return;
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    hasOverflow.value = shouldShowBrowserTabOverflow(
      viewport.scrollWidth, viewport.clientWidth, hasOverflow.value,
    );
    canScrollPrevious.value = viewport.scrollLeft > 1;
    canScrollNext.value = viewport.scrollLeft < maxScroll - 1;
  }

  function scheduleMeasure(): void {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  }

  function scrollByPage(direction: TabScrollDirection): void {
    const viewport = input.viewport.value;
    if (!viewport) return;
    const distance = Math.max(120, Math.round(viewport.clientWidth * 0.75));
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    viewport.scrollBy({
      behavior: reducedMotion ? "auto" : "smooth",
      left: direction === "previous" ? -distance : distance,
    });
  }

  function ensureVisible(element: HTMLElement | null): void {
    const viewport = input.viewport.value;
    if (!viewport || !element) return;
    const viewportRect = viewport.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    if (elementRect.left < viewportRect.left) {
      viewport.scrollLeft -= viewportRect.left - elementRect.left;
    } else if (elementRect.right > viewportRect.right) {
      viewport.scrollLeft += elementRect.right - viewportRect.right;
    }
    scheduleMeasure();
  }

  onMounted(() => {
    const viewport = input.viewport.value;
    if (!viewport) return;
    observer = new ResizeObserver(scheduleMeasure);
    observer.observe(viewport);
    if (input.track.value) observer.observe(input.track.value);
    viewport.addEventListener("scroll", scheduleMeasure, { passive: true });
    scheduleMeasure();
  });

  watch(input.itemCount, async () => {
    await nextTick();
    scheduleMeasure();
  });

  onBeforeUnmount(() => {
    const viewport = input.viewport.value;
    if (viewport) viewport.removeEventListener("scroll", scheduleMeasure);
    observer?.disconnect();
    if (frame) cancelAnimationFrame(frame);
  });

  return {
    hasOverflow: readonly(hasOverflow),
    canScrollPrevious: readonly(canScrollPrevious),
    canScrollNext: readonly(canScrollNext),
    ensureVisible,
    scrollByPage,
  };
}
