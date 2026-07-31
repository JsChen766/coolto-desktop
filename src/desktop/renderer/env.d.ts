import type { DesktopApi } from "../shared/types";
import type { localeCode, translate, translateFormat } from "./src/i18n/locale";

declare module "vue" {
  interface ComponentCustomProperties {
    $t: typeof translate;
    $locale: typeof localeCode;
    $tf: typeof translateFormat;
  }
}

declare global {
  interface Window {
    coolto?: DesktopApi;
  }
}

export {};
