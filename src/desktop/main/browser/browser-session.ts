import { session, type Session } from "electron";

const BROWSER_PARTITION = "persist:browser";

let cachedSession: Session | undefined;
const permissionListeners = new Set<(event: BrowserPermissionDeniedEvent) => void>();

export interface BrowserPermissionDeniedEvent {
  origin: string | null;
  permission: string;
}

/**
 * B0-D3: 所有内置浏览器网站共享单一 persist partition，
 * 行为与真实浏览器一致，Cookie 跨 App 重启保留；与主窗口 defaultSession 隔离。
 */
export function getBrowserSession(): Session {
  if (!cachedSession) {
    cachedSession = session.fromPartition(BROWSER_PARTITION);
    cachedSession.setPermissionCheckHandler(() => false);
    cachedSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(false);
      const event = { origin: safeOrigin(contents.getURL()), permission };
      for (const listener of permissionListeners) listener(event);
    });
  }
  return cachedSession;
}

export function onBrowserPermissionDenied(
  listener: (event: BrowserPermissionDeniedEvent) => void,
): () => void {
  permissionListeners.add(listener);
  return () => permissionListeners.delete(listener);
}

function safeOrigin(value: string): string | null {
  try {
    const origin = new URL(value).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

export { BROWSER_PARTITION };
