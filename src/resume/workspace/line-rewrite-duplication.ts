const MIN_SHARED_NOVEL_CHARACTERS = 10;
const MAX_SHARED_NOVEL_CHARACTERS = 32;

interface RewriteCandidate {
  bulletId: string;
  existing: string;
  revisedText: string;
}

/** Finds boilerplate newly introduced into multiple bullets in one batch. */
export function duplicateNovelLineRewriteReasons(
  candidates: readonly RewriteCandidate[],
): Map<string, string> {
  const reasons = new Map<string, string>();
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex]!;
    for (let rightIndex = leftIndex + 1;
      rightIndex < candidates.length; rightIndex += 1) {
      const right = candidates[rightIndex]!;
      const repeated = sharedNovelFragment(left, right);
      if (!repeated) continue;
      const reason = `本批多个 bullet 重复新增同一片段“${repeated}”；` +
        "必须分别使用各自证据支持的不同方法、对象、范围、交付物或结果";
      reasons.set(left.bulletId, reason);
      reasons.set(right.bulletId, reason);
    }
  }
  return reasons;
}

function sharedNovelFragment(
  left: RewriteCandidate,
  right: RewriteCandidate,
): string | undefined {
  const changedLeft = normalized(left.revisedText);
  const changedRight = normalized(right.revisedText);
  const baselineLeft = normalized(left.existing);
  const baselineRight = normalized(right.existing);
  const maximum = Math.min(
    MAX_SHARED_NOVEL_CHARACTERS,
    changedLeft.length,
    changedRight.length,
  );
  for (let size = maximum; size >= MIN_SHARED_NOVEL_CHARACTERS; size -= 1) {
    for (let index = 0; index + size <= changedLeft.length; index += 1) {
      const fragment = changedLeft.slice(index, index + size);
      if (!completeAsciiFragment(changedLeft, index, size)) continue;
      if (!changedRight.includes(fragment)) continue;
      if (baselineLeft.includes(fragment) || baselineRight.includes(fragment)) continue;
      return fragment;
    }
  }
  return undefined;
}

function completeAsciiFragment(text: string, index: number, size: number): boolean {
  const fragment = text.slice(index, index + size);
  if (!/^[\x00-\x7F]+$/u.test(fragment)) return true;
  const startsInsideWord = index > 0 && word(text[index - 1]) && word(text[index]);
  const end = index + size;
  const endsInsideWord = end < text.length && word(text[end - 1]) && word(text[end]);
  return !startsInsideWord && !endsInsideWord;
}

function word(value: string | undefined): boolean {
  return Boolean(value && /[A-Za-z0-9_]/u.test(value));
}

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim()
    .toLocaleLowerCase();
}
