import { createServer, type Server } from "node:http";

import { frameHtml, pageOneHtml, pageTwoHtml } from "./browser-agent-qa-fixtures.js";

export async function startBrowserAgentQaServer(
  onDownloadRequest: () => void,
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/download")) {
      onDownloadRequest();
      response.setHeader("content-type", "application/octet-stream");
      response.setHeader("content-disposition", "attachment; filename=qa-download.txt");
      const body = Buffer.from("download fixture");
      response.setHeader("content-length", String(body.length));
      response.end(body);
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url?.startsWith("/frame")) response.end(frameHtml);
    else if (request.url?.startsWith("/page-2")) response.end(pageTwoHtml);
    else response.end(pageOneHtml);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("QA server address unavailable");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

export function closeBrowserAgentQaServer(value: Server | undefined): Promise<void> {
  return new Promise((resolve) => value ? value.close(() => resolve()) : resolve());
}
