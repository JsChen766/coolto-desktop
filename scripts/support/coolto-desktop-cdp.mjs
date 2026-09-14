import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const CDP_REQUEST_TIMEOUT_MS = 8_000;

export function isCooltoPageUrl(value) {
  try {
    const url = new URL(value ?? "");
    return /\/renderer\/index\.html$/u.test(url.pathname) ||
      (url.hostname === "localhost" && url.pathname === "/");
  } catch {
    return false;
  }
}

export async function findCooltoPage(base, waitMs) {
  const deadline = Date.now() + waitMs;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/json`);
      const targets = await response.json();
      const page = targets.find((target) =>
        target.type === "page" &&
        target.webSocketDebuggerUrl &&
        target.title === "Coolto" &&
        isCooltoPageUrl(target.url)
      );
      if (page) return page;
      lastError = `targets=${targets.length}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(400);
  }
  throw new Error(`No Coolto CDP page at ${base} within ${waitMs}ms (${lastError})`);
}

export async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    callback(message);
  });
  return {
    async send(method, params = {}, timeoutMs = CDP_REQUEST_TIMEOUT_MS) {
      const id = nextId++;
      const response = await new Promise((resolveResponse, rejectResponse) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rejectResponse(new Error(`CDP request timed out: ${method}`));
        }, timeoutMs);
        pending.set(id, (message) => {
          clearTimeout(timer);
          resolveResponse(message);
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
      if (response.error) {
        throw new Error(`${method}: ${response.error.message}`);
      }
      return response.result ?? {};
    },
    close: () => socket.close(),
  };
}

export async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ?? "CDP evaluation failed",
    );
  }
  return result.result?.value;
}

export async function revealWindow(session) {
  try {
    const info = await session.send("Browser.getWindowForTarget", {}, 5_000);
    await session.send("Browser.setWindowBounds", {
      windowId: info.windowId,
      bounds: { windowState: "normal" },
    }, 5_000);
  } catch {
    /* Packaged Electron may deny Browser domain. */
  }
  try {
    await session.send("Page.bringToFront", {}, 3_000);
  } catch {
    /* Optional. */
  }
}

export async function captureScreenshot(session, outputPath) {
  const output = resolve(outputPath);
  await session.send("Page.enable");
  await revealWindow(session);
  const result = await capturePng(session);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(result.data, "base64"));
  return output;
}

async function capturePng(session) {
  try {
    return await session.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    }, 12_000);
  } catch {
    return session.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: 960, height: 640, scale: 0.5 },
    }, 12_000);
  }
}

export async function withCooltoPage(cdpBase, waitMs, operation) {
  const page = await findCooltoPage(cdpBase, waitMs);
  const session = await connectCdp(page.webSocketDebuggerUrl);
  try {
    await session.send("Runtime.enable");
    await revealWindow(session);
    return await operation(session, page);
  } finally {
    session.close();
  }
}
