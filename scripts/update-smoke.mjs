#!/usr/bin/env node
/**
 * Section G-1 update smoke driver.
 * Drives a running packaged Coolto app over CDP (--remote-debugging-port):
 *   node scripts/update-smoke.mjs --check    trigger a manual check, watch to downloaded
 *   node scripts/update-smoke.mjs --install  trigger quitAndInstall after download
 * Prints state snapshots to stdout as JSON lines.
 */
import { setTimeout as sleep } from "node:timers/promises";

const cdpBase = process.env.COOLTO_SMOKE_CDP ?? "http://127.0.0.1:9222";
const WATCH_TIMEOUT_MS = Number(process.env.COOLTO_SMOKE_TIMEOUT_MS ?? 300_000);

async function findPage() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${cdpBase}/json`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      /* app still booting */
    }
    await sleep(1000);
  }
  throw new Error("No CDP page target within 60s");
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  return {
    socket,
    async send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(session, expression) {
  const message = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (message.error) throw new Error(`CDP error: ${message.error.message}`);
  if (message.result?.exceptionDetails) {
    throw new Error(
      `evaluate failed: ${message.result.exceptionDetails.text} ${message.result.exceptionDetails.exception?.description ?? ""}`,
    );
  }
  return message.result?.result?.value;
}

async function waitForPhase(session, phase, previous) {
  const deadline = Date.now() + WATCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await evaluate(session, "window.coolto.updates.getState()");
    const line = JSON.stringify(state);
    if (line !== previous) {
      console.log(`[smoke] state ${line}`);
      previous = line;
    }
    if (state.phase === phase) return state;
    if (state.phase === "error") {
      throw new Error(`Update reached error phase: ${state.message}`);
    }
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for phase ${phase}`);
}

const mode = process.argv.includes("--install")
  ? "install"
  : process.argv.includes("--check")
    ? "check"
    : "state";

const page = await findPage();
console.log(`[smoke] connected to ${page.webSocketDebuggerUrl}`);
const session = await connect(page.webSocketDebuggerUrl);

const initial = await evaluate(
  session,
  "window.coolto.updates.getState()",
);
console.log(`[smoke] initial ${JSON.stringify(initial)}`);

if (mode === "check") {
  await evaluate(session, 'window.coolto.updates.check("manual")');
  await waitForPhase(session, "downloaded", JSON.stringify(initial));
} else if (mode === "install") {
  console.log("[smoke] calling install()");
  await evaluate(session, "window.coolto.updates.install()");
  console.log("[smoke] install requested; app is expected to quit");
}

session.socket.close();
process.exit(0);
