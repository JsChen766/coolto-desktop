export function boundedMailText(value: string, max = 20_000): string {
  return value.replace(/\u0000/gu, "").replace(/\r\n?/gu, "\n").trim().slice(0, max);
}

export function htmlToPlainText(value: string): string {
  return boundedMailText(value
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/giu, " ")
    .replace(/<\s*br\s*\/?\s*>/giu, "\n")
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ").replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<").replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'")
    .replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n"));
}
