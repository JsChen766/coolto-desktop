import { createApp } from "vue";

import type { BrowserShellApi } from "@desktop/types";
import BrowserShell from "./BrowserShell.vue";
import "../styles/tokens.css";
import "./browser-shell.css";

declare global {
  interface Window {
    browserShell: BrowserShellApi;
  }
}

createApp(BrowserShell).mount("#browser-shell");
