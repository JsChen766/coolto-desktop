import { createApp } from "vue";

import type { BrowserAgentInspectorApi } from "@desktop/types";
import BrowserAgentInspectorApp from "./BrowserAgentInspectorApp.vue";
import { initializeLocale, localeCode, translate, translateFormat } from "../i18n/locale";
import "../styles/tokens.css";
import "../styles/app-scrollbar.css";
import "./style.css";

declare global {
  interface Window { browserAgentInspector: BrowserAgentInspectorApi }
}

initializeLocale();
const app = createApp(BrowserAgentInspectorApp);
app.config.globalProperties.$t = translate;
app.config.globalProperties.$locale = localeCode;
app.config.globalProperties.$tf = translateFormat;
app.mount("#browser-agent-inspector-app");
