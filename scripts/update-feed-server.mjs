#!/usr/bin/env node
/**
 * Local static feed server for update simulation (Section G-1).
 * Serves a directory over http://127.0.0.1:8099 with CORS-friendly,
 * no-cache headers so electron-updater picks up the latest metadata.
 *
 * Usage: node scripts/update-feed-server.mjs [feed-dir] [port]
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const feedDir = resolve(process.argv[2] ?? "dist-electron/update-feed");
const port = Number(process.argv[3] ?? process.env.COOLTO_UPDATE_FEED_PORT ?? 8099);
const contentTypes = new Map([
  [".yml", "text/yaml"],
  [".yaml", "text/yaml"],
  [".json", "application/json"],
  [".zip", "application/zip"],
  [".dmg", "application/octet-stream"],
  [".blockmap", "application/octet-stream"],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const relative = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const filePath = normalize(join(feedDir, relative));
  if (!filePath.startsWith(feedDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      "Content-Length": body.byteLength,
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    response.end(body);
    console.log(`[feed] 200 ${url.pathname} (${body.byteLength} bytes)`);
  } catch {
    response.writeHead(404);
    response.end("Not Found");
    console.log(`[feed] 404 ${url.pathname}`);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Update feed server listening at http://127.0.0.1:${port}`);
  console.log(`Serving directory: ${feedDir}`);
});
