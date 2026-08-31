import { createApp } from "vue";

import type { BrowserDownloadPopoverApi } from "@desktop/types";
import BrowserDownloadPopover from "../browser-shell/BrowserDownloadPopover.vue";
import {
  initializeLocale, localeCode, translate, translateFormat,
} from "../i18n/locale";
import "../styles/tokens.css";
import "../styles/app-scrollbar.css";
import "./style.css";

declare global {
  interface Window { browserDownloadPopover: BrowserDownloadPopoverApi }
}

initializeLocale();
const app = createApp(BrowserDownloadPopover);
app.config.globalProperties.$t = translate;
app.config.globalProperties.$locale = localeCode;
app.config.globalProperties.$tf = translateFormat;
app.mount("#browser-download-popover-app");
