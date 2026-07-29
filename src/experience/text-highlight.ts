export interface ExperienceHighlightPart {
  text: string;
  match: boolean;
}

export function highlightExperienceText(
  text: string,
  query: string,
): ExperienceHighlightPart[] {
  const wanted = normalizeExperienceText(query);
  if (!wanted) return [{ text, match: false }];
  const normalized = normalizeExperienceText(text);
  const index = normalized.indexOf(wanted);
  if (index < 0) return [{ text, match: false }];
  const end = index + wanted.length;
  return [
    { text: text.slice(0, index), match: false },
    { text: text.slice(index, end), match: true },
    { text: text.slice(end), match: false },
  ].filter((part) => part.text);
}

export function normalizeExperienceText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}
