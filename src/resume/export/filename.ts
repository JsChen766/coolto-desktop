const CONTROL_OR_PATH = /[\u0000-\u001f\u007f/\\:*?"<>|]/gu;
const TRAILING_DOTS_OR_SPACES = /[. ]+$/u;
const LEADING_OR_TRAILING_SEPARATORS = /^[. -]+|[. -]+$/gu;

export function resumePdfFilename(title: string): string {
  const normalized = title
    .normalize("NFKC")
    .replace(CONTROL_OR_PATH, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(TRAILING_DOTS_OR_SPACES, "")
    .replace(LEADING_OR_TRAILING_SEPARATORS, "")
    .slice(0, 120)
    .trim();
  const withoutExtension = normalized
    .replace(/\.pdf$/iu, "")
    .replace(LEADING_OR_TRAILING_SEPARATORS, "");
  const base = withoutExtension.replace(/[-. ]/gu, "")
    ? withoutExtension
    : "resume";
  return `${base}.pdf`;
}
