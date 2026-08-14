#!/usr/bin/env node
/**
 * Generates the /downloads/ landing page from the release feed metadata.
 *
 * Reads dist-electron/latest.yml (Windows) and latest-mac.yml (macOS, when
 * present) and writes dist-electron/index.html. The page links the installers
 * at relative paths so it works both on the release server (installed as
 * /srv/coolto-releases/index.html) and in the local update-feed simulation.
 *
 * Usage: node scripts/generate-download-page.mjs [dist-dir]
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const distDir = resolve(process.argv[2] ?? "dist-electron");

async function readFeed(name) {
  try {
    const raw = await readFile(join(distDir, name), "utf8");
    const version = /^version:\s*(.+)$/m.exec(raw)?.[1]?.trim();
    const files = raw.split("\n").filter((line) => line.startsWith("  - url:"));
    const urls = files.map((line) =>
      line.replace(/^  - url:\s*/, "").trim(),
    );
    return { version: version ?? "unknown", urls };
  } catch {
    return null;
  }
}

function pick(feed, extensions) {
  return feed?.urls.find((url) => extensions.some((ext) => url.endsWith(ext)));
}

const win = await readFeed("latest.yml");
const mac = await readFeed("latest-mac.yml");

const winUrl = pick(win, [".exe"]);
// macOS ships separate x64/arm64 zips; arm64 urls carry the "arm64" marker.
const macUrls = (mac?.urls ?? []).filter((url) => /\.(zip|dmg)$/.test(url));
const macIntelUrl = macUrls.find((url) => !url.includes("arm64"));
const macArmUrl = macUrls.find((url) => url.includes("arm64"));
const releaseDate = new Date().toISOString().slice(0, 10);

if (!win && !mac) {
  console.error("no feed metadata found in", distDir);
  process.exit(1);
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Coolto 下载</title>
<meta name="description" content="Coolto（库投）— AI 求职工作台。下载 Windows / macOS 桌面客户端。">
<style>
  :root { color-scheme: light; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Microsoft YaHei", sans-serif;
    background: linear-gradient(160deg, #faf7ff 0%, #fff 45%, #fff5f8 100%);
    min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; padding: 48px 20px;
  }
  .card {
    background: #fff; border-radius: 20px; box-shadow: 0 20px 60px rgba(124,58,237,.12);
    padding: 48px 40px; max-width: 640px; width: 100%; text-align: center;
  }
  .logo {
    font-size: 40px; font-weight: 800; letter-spacing: .5px;
    background: linear-gradient(90deg, #7C3AED, #EC4899, #F59E0B);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .tagline { margin-top: 8px; color: #6b7280; font-size: 15px; }
  .version { margin-top: 24px; color: #9ca3af; font-size: 13px; }
  .platforms { margin-top: 28px; display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
  a.btn {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 14px 28px; border-radius: 12px; text-decoration: none;
    font-size: 15px; font-weight: 600; transition: transform .15s ease, box-shadow .15s ease;
  }
  a.btn.win { background: #7C3AED; color: #fff; box-shadow: 0 8px 24px rgba(124,58,237,.35); }
  a.btn.mac { background: #111827; color: #fff; box-shadow: 0 8px 24px rgba(17,24,39,.25); }
  a.btn:hover { transform: translateY(-2px); }
  a.btn.disabled { background: #e5e7eb; color: #9ca3af; box-shadow: none; cursor: not-allowed; }
  .note { margin-top: 20px; color: #9ca3af; font-size: 12px; line-height: 1.8; }
  .note code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">Coolto</div>
    <div class="tagline">AI 求职工作台 · 把经历变成更有针对性的表达</div>
    <div class="version">最新版本：${win?.version ?? mac?.version ?? "unknown"}${releaseDate ? ` · 更新于 ${releaseDate}` : ""}</div>
    <div class="platforms">
      ${
        winUrl
          ? `<a class="btn win" href="${winUrl}">⬇ Windows 版（x64）</a>`
          : `<span class="btn win disabled">Windows 版准备中</span>`
      }
      ${
        macArmUrl
          ? `<a class="btn mac" href="${macArmUrl}">⬇ macOS（Apple 芯片）</a>`
          : `<span class="btn mac disabled">macOS 版准备中</span>`
      }
      ${
        macIntelUrl
          ? `<a class="btn mac" href="${macIntelUrl}">⬇ macOS（Intel）</a>`
          : ""
      }
    </div>
    <div class="note">
      安装后应用会自动检查更新。手动检查：设置 → 检查更新。<br>
      更新源：<code>https://home.coolto.com.cn/downloads/</code>
    </div>
  </div>
</body>
</html>
`;

await writeFile(join(distDir, "index.html"), html);
console.log("wrote index.html in", distDir);
console.log(
  "  win:",
  winUrl ?? "-",
  "| mac arm64:",
  macArmUrl ?? "-",
  "| mac intel:",
  macIntelUrl ?? "-",
);
