import type { IpcMain } from "electron";

import type { DesktopAuthService } from "./auth-service.js";

export function registerCheckoutIpc(
  ipcMain: IpcMain,
  auth: DesktopAuthService,
): void {
  ipcMain.handle("checkout:plans", () => auth.getCheckoutPlans());
  ipcMain.handle("checkout:create", (_event, planType: string) =>
    auth.createCheckout(planType),
  );
  ipcMain.handle("checkout:verify", (_event, checkoutId: string) =>
    auth.verifyCheckout(checkoutId),
  );
}

export const CHECKOUT_IPC_CHANNELS = [
  "checkout:plans",
  "checkout:create",
  "checkout:verify",
] as const;
