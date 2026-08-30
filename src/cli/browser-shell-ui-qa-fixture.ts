import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#356fca"/>
  <path d="M21 10a8 8 0 1 0 0 12" fill="none" stroke="white" stroke-width="4"/>
</svg>`;

export interface BrowserShellFixture {
  baseUrl: string;
  close(): Promise<void>;
}

export async function startBrowserShellFixture(): Promise<BrowserShellFixture> {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (path === "/favicon.svg") {
      response.writeHead(200, { "content-type": "image/svg+xml" });
      response.end(FAVICON);
      return;
    }
    if (path === "/slow") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.write(page("Slow fixture", "Loading fixture"));
      const timer = setTimeout(() => {
        timers.delete(timer);
        response.end("</body></html>");
      }, 5_000);
      timers.add(timer);
      return;
    }
    if (path === "/redirect") {
      response.writeHead(302, { location: "/" });
      response.end();
      return;
    }
    if (path === "/permission") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`${page("Permission fixture", "Permission fixture")}
        <script>Notification.requestPermission().then(
          value => document.body.dataset.permission = value,
          () => document.body.dataset.permission = 'rejected'
        )</script></body></html>`);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`${page("Favicon fixture", "Favicon fixture")}</body></html>`);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${addressPort(server)}`,
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function page(title: string, text: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
    <title>${title}</title><link rel="icon" href="/favicon.svg"></head>
    <body><h1>${text}</h1>`;
}

function addressPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture port unavailable");
  return address.port;
}
