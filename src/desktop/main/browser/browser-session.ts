import { session, type Session } from "electron";

import { localScopeKey } from "../../../privacy/local-scope.js";

const ANONYMOUS_PARTITION = "persist:browser-anonymous";
let activePartition = ANONYMOUS_PARTITION;
const sessions = new Map<string, Session>();
const permissionListeners = new Set<(event: BrowserPermissionDeniedEvent) => void>();
const scopeListeners = new Set<(value: Session) => void>();

export interface BrowserPermissionDeniedEvent {
  origin: string | null;
  permission: string;
}

export function setBrowserSessionScope(apiBaseUrl: string, ownerId: string): void {
  activePartition = partitionFor(apiBaseUrl, ownerId);
  const current = getBrowserSession();
  for (const listener of scopeListeners) listener(current);
}

export function resetBrowserSessionScope(): void {
  activePartition = ANONYMOUS_PARTITION;
  const current = getBrowserSession();
  for (const listener of scopeListeners) listener(current);
}

export function getBrowserSessionForScope(apiBaseUrl: string, ownerId: string): Session {
  return getSession(partitionFor(apiBaseUrl, ownerId));
}

export function getBrowserSession(): Session {
  return getSession(activePartition);
}

export function onBrowserSessionChanged(listener: (value: Session) => void): () => void {
  scopeListeners.add(listener);
  return () => scopeListeners.delete(listener);
}

export function onBrowserPermissionDenied(
  listener: (event: BrowserPermissionDeniedEvent) => void,
): () => void {
  permissionListeners.add(listener);
  return () => permissionListeners.delete(listener);
}

function partitionFor(apiBaseUrl: string, ownerId: string): string {
  return `persist:browser-${localScopeKey(apiBaseUrl, ownerId)}`;
}

function getSession(partition: string): Session {
  const existing = sessions.get(partition);
  if (existing) return existing;
  const current = session.fromPartition(partition);
  current.setPermissionCheckHandler(() => false);
  current.setPermissionRequestHandler((contents, permission, callback) => {
    callback(false);
    const event = { origin: safeOrigin(contents.getURL()), permission };
    for (const listener of permissionListeners) listener(event);
  });
  sessions.set(partition, current);
  return current;
}

function safeOrigin(value: string): string | null {
  try {
    const origin = new URL(value).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

export const BROWSER_PARTITION = ANONYMOUS_PARTITION;
