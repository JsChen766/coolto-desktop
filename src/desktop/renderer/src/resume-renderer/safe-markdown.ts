import { marked } from "marked";
export { safeContactLink } from "./contact-link.js";

const INLINE_TAGS = new Set(["P", "BR", "STRONG", "EM", "A", "SPAN"]);

/** Matches the Web ResumeDocument inline Markdown and sanitization contract. */
export function renderSafeInlineMarkdown(value: string): string {
  const rendered = marked.parseInline(value, { breaks: true }) as string;
  const holder = document.createElement("template");
  holder.innerHTML = rendered;
  for (const element of Array.from(holder.content.querySelectorAll("*"))) {
    if (!INLINE_TAGS.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent ?? ""));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      element.removeAttribute(attribute.name);
    }
  }
  return holder.innerHTML;
}

export function setSafeInlineMarkdown(
  element: HTMLElement,
  value: string,
): void {
  element.innerHTML = renderSafeInlineMarkdown(value);
}
