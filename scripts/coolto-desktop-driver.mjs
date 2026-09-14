#!/usr/bin/env node
/**
 * Drive the real Coolto Electron window over opt-in CDP.
 *
 * Default: isolated QA profile at local-qa-data/desktop-driver/user-data
 * (gitignored). Do not attach to the user's daily Coolto unless asked.
 */
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  clickTarget,
  readSnapshot,
  saveScreenshot,
  setFileInput,
  typeTarget,
} from "./support/coolto-desktop-actions.mjs";
import { evaluate, withCooltoPage } from "./support/coolto-desktop-cdp.mjs";
import {
  availablePort,
  cdpReady,
  ensureDriverDirs,
  isPidAlive,
  readSession,
  screenshotDir,
  spawnDevApp,
  spawnUnpackedApp,
  stopSession,
  userDataDir,
  writeSession,
} from "./support/coolto-desktop-session.mjs";

const USAGE = `Usage: node scripts/coolto-desktop-driver.mjs <command> [options]
Commands: launch | attach | status | snapshot | wait | click | type | file | screenshot | eval | quit
Options: --cdp --port --unpacked --testid --selector --text --path --out --js --surface --timeout`;

const args = process.argv.slice(2);
const command = args[0];
const options = parseOptions(args.slice(1));

try {
  if (!command || command === "--help" || command === "-h") fail(USAGE, 0);
  const result = await dispatch(command, options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  process.exitCode = 1;
}

async function dispatch(name, opts) {
  switch (name) {
    case "launch":
      return launch(opts);
    case "attach":
      return attach(opts);
    case "status":
      return status(opts);
    case "snapshot":
      return withCdp(opts, (session) => readSnapshot(session));
    case "wait":
      return waitFor(opts);
    case "click":
      requireLocator(opts, true);
      return withCdp(opts, (session) => clickTarget(session, opts));
    case "type":
      requireLocator(opts, false);
      return withCdp(opts, (session) => typeTarget(session, opts));
    case "file":
      if (!opts.path) throw new Error("file requires --path");
      return withCdp(opts, (session) =>
        setFileInput(session, resolve(opts.path), opts.testid ?? "chat-composer-file"));
    case "screenshot":
      return withCdp(opts, async (session) => ({
        ok: true,
        path: await saveScreenshot(session, opts.out),
      }));
    case "eval":
      if (!opts.js) throw new Error("eval requires --js");
      return withCdp(opts, (session) => evaluate(session, opts.js));
    case "quit":
      return quit();
    default:
      throw new Error(`${USAGE}\nUnknown command: ${name}`);
  }
}

async function launch(opts) {
  await ensureDriverDirs();
  const existing = await liveSession(opts);
  if (existing) return { ok: true, reused: true, ...existing, userData: userDataDir };
  const port = opts.port ? Number(opts.port) : await availablePort();
  if (!Number.isFinite(port) || port <= 0) throw new Error("--port must be a positive port");
  const spawned = opts.unpacked
    ? spawnUnpackedApp(resolve(opts.unpacked), port)
    : spawnDevApp(port);
  const session = await writeSession({
    pid: spawned.pid,
    port,
    cdp: `http://127.0.0.1:${port}`,
    mode: opts.unpacked ? "unpacked" : "dev",
    unpacked: opts.unpacked ? resolve(opts.unpacked) : null,
    userData: userDataDir,
    log: spawned.logPath,
    startedAt: new Date().toISOString(),
  });
  await cdpReady(session.cdp, opts.timeout ?? 120_000);
  const snapshot = await waitUntilReady(session.cdp);
  return { ok: true, reused: false, ...session, snapshot };
}

async function waitUntilReady(cdp) {
  const deadline = Date.now() + 30_000;
  let snapshot = await withCooltoPage(cdp, 15_000, readSnapshot);
  while (
    Date.now() < deadline &&
    (snapshot.surface === "boot" || snapshot.surface === "unknown")
  ) {
    await sleep(400);
    snapshot = await withCooltoPage(cdp, 8_000, readSnapshot);
  }
  return snapshot;
}

async function attach(opts) {
  const cdp = opts.cdp ?? "http://127.0.0.1:9222";
  await cdpReady(cdp, opts.timeout ?? 15_000);
  const snapshot = await withCooltoPage(cdp, 15_000, readSnapshot);
  const session = await writeSession({
    pid: null,
    port: Number(new URL(cdp).port || 9222),
    cdp,
    mode: "attach",
    unpacked: null,
    userData: null,
    log: null,
    startedAt: new Date().toISOString(),
  });
  return { ok: true, ...session, snapshot };
}

async function status(opts) {
  const session = await resolveSession(opts);
  const alive = isPidAlive(session.pid);
  let snapshot;
  try {
    snapshot = await withCooltoPage(session.cdp, 8_000, readSnapshot);
  } catch (error) {
    snapshot = { error: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true, alive, screenshotDir, ...session, snapshot };
}

async function waitFor(opts) {
  if (!opts.surface && !opts.testid) {
    throw new Error("wait requires --surface or --testid");
  }
  const timeout = opts.timeout ?? 60_000;
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await withCdp(opts, (session) => readSnapshot(session));
    if (opts.surface && last.surface === opts.surface) return { ok: true, ...last };
    if (opts.testid && last.testids?.some((item) => item.testid === opts.testid)) {
      return { ok: true, ...last };
    }
    await sleep(400);
  }
  throw new Error(`Timed out waiting after ${timeout}ms (surface=${last?.surface ?? "?"})`);
}

async function quit() {
  const session = await readSession();
  await stopSession(session);
  await writeSession({
    pid: null,
    port: session?.port ?? null,
    cdp: session?.cdp ?? null,
    mode: "stopped",
    unpacked: session?.unpacked ?? null,
    userData: userDataDir,
    log: session?.log ?? null,
    stoppedAt: new Date().toISOString(),
  });
  return { ok: true, stopped: true, pid: session?.pid ?? null };
}

async function withCdp(opts, operation) {
  const session = await resolveSession(opts);
  return withCooltoPage(session.cdp, opts.timeout ?? 15_000, operation);
}

async function liveSession(opts) {
  const session = await readSession();
  if (!session?.cdp) return undefined;
  if (session.mode !== "attach" && !isPidAlive(session.pid)) return undefined;
  try {
    await cdpReady(opts.cdp ?? session.cdp, 3_000);
    return session;
  } catch {
    return undefined;
  }
}

async function resolveSession(opts) {
  if (opts.cdp) return { cdp: opts.cdp, pid: null, mode: "attach" };
  const session = await readSession();
  if (!session?.cdp) throw new Error("No driver session. Run launch first.");
  return session;
}

function parseOptions(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}\n${USAGE}`);
    const name = key.slice(2);
    const booleanFlags = new Set(["help"]);
    if (booleanFlags.has(name)) {
      parsed[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`);
    parsed[name] = name === "timeout" || name === "port" ? Number(value) : value;
    index += 1;
  }
  return parsed;
}

function requireLocator(opts, allowText) {
  if (opts.testid || opts.selector || (allowText && opts.text)) return;
  throw new Error(allowText
    ? "click requires --testid, --selector, or --text"
    : "type requires --testid or --selector plus --text");
}

function fail(message, code = 1) {
  process.stdout.write(`${message}\n`);
  process.exit(code);
}
