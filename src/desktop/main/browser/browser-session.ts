import { session, type Session } from "electron";

const BROWSER_PARTITION = "persist:browser";

let cachedSession: Session | undefined;

/**
 * B0-D3: 所有内置浏览器网站共享单一 persist partition，
 * 行为与真实浏览器一致，Cookie 跨 App 重启保留；与主窗口 defaultSession 隔离。
 */
export function getBrowserSession(): Session {
  if (!cachedSession) {
    cachedSession = session.fromPartition(BROWSER_PARTITION);
  }
  return cachedSession;
}

export { BROWSER_PARTITION };
