import type { CurrentUser } from "./api/types.js";

export const LOCAL_DESKTOP_ORIGIN = "local://desktop";
export const LOCAL_DESKTOP_EMAIL = "local@desktop";
export const LOCAL_DESKTOP_TOKEN = "local-desktop-token";
export const DEFAULT_LLM_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_LLM_MODEL_ID = "deepseek-chat";

export function createLocalDesktopUser(
  userId: string,
  deviceId: string,
): CurrentUser {
  return {
    id: userId,
    email: LOCAL_DESKTOP_EMAIL,
    status: "active",
    deviceId,
  };
}
