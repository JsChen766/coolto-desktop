import type {
  BrowserLocale,
  BrowserOpenInput,
  DesktopApi,
} from "@desktop/types";
import { localeCode } from "../i18n/locale";

export function openPresentedBrowser(
  api: DesktopApi,
  input: BrowserOpenInput = {},
) {
  return api.browser.open({
    locale: localeCode() as BrowserLocale,
    theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    ...input,
  });
}
