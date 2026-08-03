export function safeContactLink(value: string): string {
  const normalized = value.trim();
  if (/^(https?:\/\/|mailto:)/i.test(normalized)) return normalized;
  if (/^[\w.-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(normalized)) {
    return `mailto:${normalized}`;
  }
  return "";
}
