import { ref } from "vue";

import { commonMessages } from "./catalog-common.js";
import { runTerminalMessages } from "./catalog-run-terminal.js";
import { copyMessages } from "./catalog-copy.js";
import { creditMessages } from "./catalog-credits.js";
import { agentTaskMessages } from "./catalog-agent-tasks.js";
import { browserShellMessages } from "./catalog-browser-shell.js";
import { detailMessages } from "./catalog-details.js";
import { formatMessages } from "./catalog-format.js";
import { domainMessages } from "./catalog-domain.js";
import { feedbackMessages } from "./catalog-feedback.js";
import { resumeAgentMessages } from "./catalog-resume-agent.js";

export type AppLocale = "zh-CN" | "en-US";

interface LocaleRuntime {
  localStorage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  document?: { documentElement: { lang: string } };
  addEventListener?: (
    type: "storage",
    listener: (event: { key: string | null; newValue: string | null }) => void,
  ) => void;
}

const STORAGE_KEY = "coolto-locale";
const runtime = (globalThis as { window?: LocaleRuntime }).window;
const stored = runtime?.localStorage?.getItem(STORAGE_KEY) ?? null;

export const appLocale = ref<AppLocale>(stored === "en-US" ? "en-US" : "zh-CN");

const messages: Record<string, string> = {
  ...commonMessages,
  ...runTerminalMessages,
  ...detailMessages,
  ...formatMessages,
  ...copyMessages,
  ...domainMessages,
  ...feedbackMessages,
  ...resumeAgentMessages,
  ...creditMessages,
  ...agentTaskMessages,
  ...browserShellMessages,
};
let storageListening = false;

export function translate(source: string): string {
  if (appLocale.value === "zh-CN") return source;
  return messages[source] ?? source;
}

export function translateFormat(
  source: string,
  values: Record<string, string | number>,
): string {
  let result = translate(source);
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}

export function translateDateRange(source: string): string {
  if (appLocale.value === "zh-CN") return source;
  return source
    .replaceAll("日期待补充", translate("日期待补充"))
    .replaceAll("待补充", translate("待补充"))
    .replaceAll("至今", translate("至今"));
}

export function localizedRecord<Key extends string>(
  source: Record<Key, string>,
): Record<Key, string> {
  return new Proxy(source, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      return typeof value === "string" ? translate(value) : value;
    },
  });
}

export function setLocale(locale: AppLocale): void {
  appLocale.value = locale;
  runtime?.localStorage?.setItem(STORAGE_KEY, locale);
  if (runtime?.document) runtime.document.documentElement.lang = locale;
}

export function toggleLocale(): void {
  setLocale(appLocale.value === "zh-CN" ? "en-US" : "zh-CN");
}

export function localeCode(): string {
  return appLocale.value;
}

export function initializeLocale(): void {
  if (runtime?.document) runtime.document.documentElement.lang = appLocale.value;
  if (!runtime?.addEventListener || storageListening) return;
  storageListening = true;
  runtime.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    if (event.newValue !== "zh-CN" && event.newValue !== "en-US") return;
    appLocale.value = event.newValue;
    if (runtime.document) runtime.document.documentElement.lang = event.newValue;
  });
}
