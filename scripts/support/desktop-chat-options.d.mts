export interface DesktopChatOptions {
  help?: boolean;
  newChat?: boolean;
  requireResumeReady?: boolean;
  acceptResumeAugmentation?: boolean;
  openResumePreview?: boolean;
  message?: string;
  file?: string;
  screenshot?: string;
  cdp?: string;
  timeout?: number;
}

export function parseDesktopChatArgs(args: string[]): DesktopChatOptions;
export function desktopChatUsage(): string;
