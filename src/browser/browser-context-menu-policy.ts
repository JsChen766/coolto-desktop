export const MAX_BROWSER_CONTEXT_LINK_LENGTH = 4_096;

export interface BrowserContextMenuPolicyInput {
  linkURL?: unknown;
  selectionText?: unknown;
  formControlType?: unknown;
  editFlags?: {
    canCopy?: unknown;
  };
}

export interface BrowserContextMenuPolicy {
  linkUrl: string | null;
  canCopySelection: boolean;
  canCopyLink: boolean;
  canOpenLinkInNewTab: boolean;
}

export function deriveBrowserContextMenuPolicy(
  input: BrowserContextMenuPolicyInput,
): BrowserContextMenuPolicy {
  const linkUrl = safeBrowserContextLinkUrl(input.linkURL);
  return {
    linkUrl,
    canCopySelection: canCopyBrowserContextSelection(input),
    canCopyLink: linkUrl !== null,
    canOpenLinkInNewTab: linkUrl !== null,
  };
}

export function safeBrowserContextLinkUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (
    !candidate ||
    candidate.length > MAX_BROWSER_CONTEXT_LINK_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(candidate)
  ) {
    return null;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const normalized = url.toString();
    return normalized.length <= MAX_BROWSER_CONTEXT_LINK_LENGTH ? normalized : null;
  } catch {
    return null;
  }
}

export function canCopyBrowserContextSelection(
  input: BrowserContextMenuPolicyInput,
): boolean {
  if (input.formControlType === "input-password") return false;
  return input.editFlags?.canCopy === true &&
    typeof input.selectionText === "string" &&
    input.selectionText.length > 0;
}
