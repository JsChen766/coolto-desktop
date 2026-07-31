import { createApp } from "vue";

import type { BrowserShellApi } from "@desktop/types";
import BrowserShell from "./BrowserShell.vue";
import {
  initializeLocale,
  localeCode,
  translate,
  translateFormat,
} from "../i18n/locale";
import "../styles/tokens.css";
import "./browser-shell.css";

declare global {
  interface Window {
    browserShell: BrowserShellApi;
  }
}

initializeLocale();
const app = createApp(BrowserShell);
app.config.globalProperties.$t = translate;
app.config.globalProperties.$locale = localeCode;
app.config.globalProperties.$tf = translateFormat;
app.mount("#browser-shell");
