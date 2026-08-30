import { onBeforeUnmount, ref, watch, type Ref } from "vue";

export function useGuidedComposer(input: {
  preset: () => string | undefined;
  text: Ref<string>;
  resized(): void;
}) {
  const typing = ref(false);
  let run = 0;

  watch(input.preset, (preset) => {
    if (preset === undefined) return;
    const current = ++run;
    input.text.value = "";
    typing.value = true;
    void typePreset(preset, current);
  });

  async function typePreset(preset: string, current: number): Promise<void> {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      input.text.value = preset;
      typing.value = false;
      input.resized();
      return;
    }
    for (const character of preset) {
      if (current !== run) return;
      input.text.value += character;
      input.resized();
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
    if (current === run) typing.value = false;
  }

  onBeforeUnmount(() => { run += 1; });
  return { typing };
}
