export interface BrowserShortcutInput {
  type: string;
  key: string;
  code: string;
  isAutoRepeat: boolean;
  isComposing: boolean;
  shift: boolean;
  control: boolean;
  alt: boolean;
  meta: boolean;
}

export interface BrowserShortcutContext {
  downloadOpen: boolean;
  findOpen: boolean;
  inspectorOpen: boolean;
  isLoading: boolean;
}

export type BrowserShortcutIntent =
  | { kind: "focus-address" }
  | { kind: "new-tab" }
  | { kind: "close-tab" }
  | { kind: "cycle-tab"; direction: "next" | "previous" }
  | { kind: "select-tab"; index: number }
  | { kind: "select-last-tab" }
  | { kind: "reload" }
  | { kind: "stop-loading" }
  | { kind: "go-back" }
  | { kind: "go-forward" }
  | { kind: "open-find" }
  | { kind: "close-find" }
  | { kind: "close-downloads" }
  | { kind: "close-inspector" }
  | { kind: "find-next"; direction: "next" | "previous" }
  | { kind: "zoom"; action: "in" | "out" | "reset" };

export function resolveBrowserShortcut(
  input: BrowserShortcutInput,
  platform: string,
  context: BrowserShortcutContext,
): BrowserShortcutIntent | null {
  if (input.type !== "keyDown" || input.isComposing || input.isAutoRepeat) {
    return null;
  }

  const isMac = platform === "darwin";
  if (matches(input, "Escape", "Escape") && noModifiers(input)) {
    if (context.findOpen) return { kind: "close-find" };
    if (context.downloadOpen) return { kind: "close-downloads" };
    if (context.inspectorOpen) return { kind: "close-inspector" };
    if (context.isLoading) return { kind: "stop-loading" };
    return null;
  }

  const cycle = cycleTabIntent(input);
  if (cycle) return cycle;

  if (!isMac && matches(input, "F5", "F5") && noModifiers(input)) {
    return { kind: "reload" };
  }
  if (!isMac && matches(input, "F3", "F3") && functionKeyModifiers(input)) {
    return {
      kind: "find-next",
      direction: input.shift ? "previous" : "next",
    };
  }

  const history = historyIntent(input, isMac);
  if (history) return history;
  if (!primaryModifierOnly(input, isMac)) return null;

  if (matches(input, "KeyG", "g") && isMac) {
    return {
      kind: "find-next",
      direction: input.shift ? "previous" : "next",
    };
  }
  if (isZoomInKey(input)) return { kind: "zoom", action: "in" };
  if (input.shift) return null;
  if (isZoomOutKey(input)) return { kind: "zoom", action: "out" };
  if (isZoomResetKey(input)) return { kind: "zoom", action: "reset" };
  if (matches(input, "KeyL", "l")) return { kind: "focus-address" };
  if (matches(input, "KeyT", "t")) return { kind: "new-tab" };
  if (matches(input, "KeyW", "w")) return { kind: "close-tab" };
  if (matches(input, "KeyR", "r")) return { kind: "reload" };
  if (matches(input, "KeyF", "f")) return { kind: "open-find" };

  const digit = tabDigit(input);
  if (digit === 9) return { kind: "select-last-tab" };
  if (digit !== null) return { kind: "select-tab", index: digit - 1 };
  return null;
}

function cycleTabIntent(input: BrowserShortcutInput): BrowserShortcutIntent | null {
  if (!input.control || input.meta || input.alt) return null;
  if (matches(input, "Tab", "Tab")) {
    return {
      kind: "cycle-tab",
      direction: input.shift ? "previous" : "next",
    };
  }
  if (input.shift) return null;
  if (matches(input, "PageDown", "PageDown")) {
    return { kind: "cycle-tab", direction: "next" };
  }
  if (matches(input, "PageUp", "PageUp")) {
    return { kind: "cycle-tab", direction: "previous" };
  }
  return null;
}

function historyIntent(
  input: BrowserShortcutInput,
  isMac: boolean,
): BrowserShortcutIntent | null {
  if (isMac) {
    if (!primaryModifierOnly(input, true) || input.shift) return null;
    if (matches(input, "BracketLeft", "[")) return { kind: "go-back" };
    if (matches(input, "BracketRight", "]")) return { kind: "go-forward" };
    return null;
  }
  if (!input.alt || input.control || input.meta || input.shift) return null;
  if (matches(input, "ArrowLeft", "ArrowLeft")) return { kind: "go-back" };
  if (matches(input, "ArrowRight", "ArrowRight")) return { kind: "go-forward" };
  return null;
}

function primaryModifierOnly(input: BrowserShortcutInput, isMac: boolean): boolean {
  return !input.alt && (isMac
    ? input.meta && !input.control
    : input.control && !input.meta);
}

function functionKeyModifiers(input: BrowserShortcutInput): boolean {
  return !input.control && !input.alt && !input.meta;
}

function noModifiers(input: BrowserShortcutInput): boolean {
  return !input.shift && !input.control && !input.alt && !input.meta;
}

function matches(input: BrowserShortcutInput, code: string, key: string): boolean {
  return input.code === code || input.key.toLocaleLowerCase() === key.toLocaleLowerCase();
}

function isZoomInKey(input: BrowserShortcutInput): boolean {
  return input.code === "Equal" || input.code === "NumpadAdd" || input.key === "+";
}

function isZoomOutKey(input: BrowserShortcutInput): boolean {
  return input.code === "Minus" || input.code === "NumpadSubtract" || input.key === "-";
}

function isZoomResetKey(input: BrowserShortcutInput): boolean {
  return input.code === "Digit0" || input.code === "Numpad0" || input.key === "0";
}

function tabDigit(input: BrowserShortcutInput): number | null {
  const codeMatch = /^Digit([1-9])$/u.exec(input.code);
  const keyMatch = /^[1-9]$/u.exec(input.key);
  return Number(codeMatch?.[1] ?? keyMatch?.[0]) || null;
}
