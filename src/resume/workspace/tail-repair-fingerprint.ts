export function tailGrowthFingerprint(text: string): string {
  const normalized = text.normalize("NFKC").trim().toLocaleLowerCase();
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const character of normalized) {
    const value = character.codePointAt(0) ?? 0;
    left = Math.imul(left ^ value, 0x01000193);
    right = Math.imul(right ^ value, 0x85ebca6b);
  }
  return normalized.length + ":" + (left >>> 0).toString(16) + ":" +
    (right >>> 0).toString(16);
}
