export interface BrowserUserAgentInput {
  chromeVersion: string;
  platform: NodeJS.Platform;
}

const DESKTOP_PLATFORM_TOKENS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "Macintosh; Intel Mac OS X 10_15_7",
  linux: "X11; Linux x86_64",
  win32: "Windows NT 10.0; Win64; x64",
};

/**
 * Build Chromium's reduced desktop user agent without Electron or app tokens.
 * The major version remains tied to the bundled engine so the network identity
 * does not claim capabilities from a different Chrome release.
 */
export function buildBrowserUserAgent(input: BrowserUserAgentInput): string {
  const chromeMajor = readChromeMajor(input.chromeVersion);
  const platformToken =
    DESKTOP_PLATFORM_TOKENS[input.platform] ??
    DESKTOP_PLATFORM_TOKENS.linux;
  return [
    `Mozilla/5.0 (${platformToken})`,
    "AppleWebKit/537.36 (KHTML, like Gecko)",
    `Chrome/${chromeMajor}.0.0.0`,
    "Safari/537.36",
  ].join(" ");
}

function readChromeMajor(version: string): string {
  const match = /^(\d+)(?:\.|$)/u.exec(version.trim());
  if (!match?.[1]) {
    throw new Error(`无法识别 Chromium 版本：${version}`);
  }
  return match[1];
}
