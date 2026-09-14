export interface DesktopShellPrefs {
  alwaysOnTop: boolean;
}

export function parseDesktopShellPrefs(raw: unknown): DesktopShellPrefs {
  if (!raw || typeof raw !== "object") return { alwaysOnTop: false };
  return { alwaysOnTop: (raw as { alwaysOnTop?: unknown }).alwaysOnTop === true };
}
