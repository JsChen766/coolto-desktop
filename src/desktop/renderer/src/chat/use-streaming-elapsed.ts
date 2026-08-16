import { onBeforeUnmount, ref, watch, type Ref } from "vue";

/** 流式输出耗时计时器：running 为 true 时启动，每秒刷新 mm:ss。 */
export function useStreamingElapsed(running: Ref<boolean>): {
  elapsed: Ref<string>;
} {
  const elapsed = ref("");
  let timer: ReturnType<typeof setInterval> | undefined;
  let startedAt = 0;

  function tick(): void {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    elapsed.value =
      seconds >= 60
        ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
        : `${seconds}s`;
  }

  watch(running, (isRunning) => {
    if (isRunning) {
      startedAt = Date.now();
      tick();
      timer = setInterval(tick, 1000);
    } else if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  });

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });

  return { elapsed };
}
