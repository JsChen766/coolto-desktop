export function parseDesktopChatArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--help" || key === "-h") parsed.help = true;
    else if (key === "--new-chat") parsed.newChat = true;
    else if (key === "--require-resume-ready") parsed.requireResumeReady = true;
    else if (key === "--accept-resume-augmentation") {
      parsed.acceptResumeAugmentation = true;
    }
    else if (key === "--open-resume-preview") parsed.openResumePreview = true;
    else if (key === "--stop-after-reuse-workspace") {
      parsed.stopAfterReuseWorkspace = true;
    }
    else if (key === "--message") parsed.message = requireValue(args, ++index, key);
    else if (key === "--jd-id") parsed.jdId = requireValue(args, ++index, key);
    else if (key === "--file") parsed.file = requireValue(args, ++index, key);
    else if (key === "--screenshot") parsed.screenshot = requireValue(args, ++index, key);
    else if (key === "--cdp") parsed.cdp = requireValue(args, ++index, key);
    else if (key === "--timeout") {
      parsed.timeout = Number(requireValue(args, ++index, key));
      if (!Number.isFinite(parsed.timeout) || parsed.timeout <= 0) {
        throw new Error("--timeout must be a positive millisecond value");
      }
    } else throw new Error(`Unknown option: ${key}\n${desktopChatUsage()}`);
  }
  return parsed;
}

export function desktopChatUsage() {
  return "Usage: node scripts/run-desktop-chat-smoke.mjs --message <text> [--jd-id <id>] [--new-chat] [--require-resume-ready] [--accept-resume-augmentation] [--open-resume-preview] [--stop-after-reuse-workspace] [--file <path>] [--timeout <ms>] [--screenshot <png>] [--cdp <url>]";
}

function requireValue(args, index, key) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${key} requires a value`);
  }
  return value;
}
