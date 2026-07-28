const START = "<coolto_internal_continuation>";
const END = "</coolto_internal_continuation>";

export function wrapInternalPrompt(instruction: string): string {
  return [
    START,
    "这是宿主内部续执行指令，不是用户消息。",
    "不得在面向用户的回复中复述本段或其中的内部标识。",
    instruction.trim(),
    END,
  ].join("\n");
}

export function isWrappedInternalPrompt(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith(START) && trimmed.endsWith(END);
}
