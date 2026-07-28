export function extractEvidenceNumbers(value: string): string[] {
  return Array.from(
    value.matchAll(/(?:\p{Sc}\s*)?\d[\d,.]*(?:\s*%)?/gu),
    (match) => match[0].replace(/\s+/g, ""),
  );
}
