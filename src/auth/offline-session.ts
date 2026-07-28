import { CooltoApiError } from "../api/coolto-api-error.js";
import type { CurrentUser } from "../api/types.js";

export type OfflineCurrentUser = CurrentUser & { deviceId: string };

export function canRestoreOffline(
  error: unknown,
  user: CurrentUser | undefined,
): user is OfflineCurrentUser {
  if (!user?.deviceId || error instanceof CooltoApiError) return false;
  return (
    error instanceof TypeError ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}
