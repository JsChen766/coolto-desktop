import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { UpdateStateEvent } from "../src/desktop/shared/types.js";
import { ElectronUpdateService } from "../src/desktop/main/update/electron-update-service.js";
import type {
  UpdateDriver,
  UpdateDriverEventMap,
} from "../src/desktop/main/update/electron-update-service.js";
import {
  initialState,
  isInstallable,
  reduceUpdateState,
} from "../src/desktop/main/update/update-state.js";

test("initialState exposes the current version and idle defaults", () => {
  const state = initialState("0.1.0");
  assert.deepEqual(state, {
    phase: "idle",
    currentVersion: "0.1.0",
    updateVersion: null,
    percent: null,
    message: null,
    errorStage: null,
  });
});

test("reduceUpdateState follows the check → download → ready flow", () => {
  const state = apply(
    initialState("0.1.0"),
    { type: "checking" },
    { type: "available", version: "0.2.0" },
    { type: "download-progress", percent: 42 },
    { type: "downloaded", version: "0.2.0" },
  );
  assert.equal(state.phase, "downloaded");
  assert.equal(state.updateVersion, "0.2.0");
  assert.equal(state.percent, 100);
  assert.equal(state.message, null);
});

test("not-available resets to idle and clears update context", () => {
  const state = apply(
    initialState("0.1.0"),
    { type: "checking" },
    { type: "available", version: "0.2.0" },
    { type: "not-available" },
  );
  assert.equal(state.phase, "idle");
  assert.equal(state.updateVersion, null);
  assert.equal(state.percent, null);
  assert.equal(state.message, null);
});

test("download progress is clamped to 0–100 and non-finite values", () => {
  const under = reduceUpdateState(initialState("0.1.0"), {
    type: "download-progress",
    percent: -5,
  });
  assert.equal(under.percent, 0);
  const over = reduceUpdateState(initialState("0.1.0"), {
    type: "download-progress",
    percent: 250,
  });
  assert.equal(over.percent, 100);
  const broken = reduceUpdateState(initialState("0.1.0"), {
    type: "download-progress",
    percent: Number.NaN,
  });
  assert.equal(broken.percent, 0);
});

test("error phase keeps update context, message and stage", () => {
  const state = apply(
    initialState("0.1.0"),
    { type: "available", version: "0.2.0" },
    { type: "error", message: "下载失败", stage: "install" },
  );
  assert.equal(state.phase, "error");
  assert.equal(state.message, "下载失败");
  assert.equal(state.errorStage, "install");
  assert.equal(state.updateVersion, "0.2.0");
});

test("installing phase resets prior error context", () => {
  const state = apply(
    initialState("0.1.0"),
    { type: "error", message: "下载失败", stage: "install" },
    { type: "installing" },
  );
  assert.equal(state.phase, "installing");
  assert.equal(state.message, null);
  assert.equal(state.errorStage, null);
});

test("only downloaded phase is installable", () => {
  assert.equal(isInstallable("downloaded"), true);
  assert.equal(isInstallable("idle"), false);
  assert.equal(isInstallable("checking"), false);
  assert.equal(isInstallable("available"), false);
  assert.equal(isInstallable("downloading"), false);
  assert.equal(isInstallable("installing"), false);
  assert.equal(isInstallable("error"), false);
});

test("service maps driver events into state and notifies subscribers", () => {
  const driver = new FakeUpdateDriver();
  const service = createService(driver);
  const seen: string[] = [];
  service.subscribe((state) => seen.push(state.phase));
  service.init();

  driver.emit("checking-for-update");
  driver.emit("update-available", { version: "0.2.0", files: [] });

  assert.deepEqual(seen, ["checking", "available", "error"]);
  assert.equal(service.getState().errorStage, "install");
});

test("service surfaces driver errors as the check error phase", () => {
  const driver = new FakeUpdateDriver();
  const service = createService(driver);
  service.init();
  driver.emit("error", new Error("feed unreachable"));
  assert.equal(service.getState().phase, "error");
  assert.equal(service.getState().errorStage, "check");
  assert.equal(service.getState().message, "feed unreachable");
});

test("concurrent checkForUpdates calls share a single driver check", async () => {
  const driver = new FakeUpdateDriver();
  const service = createService(driver);
  service.init();
  const first = service.checkForUpdates("silent");
  const second = service.checkForUpdates("manual");
  await Promise.all([first, second]);
  assert.equal(driver.checkCalls, 1);
});

test("checkForUpdates failure lands in error phase and releases the lock", async () => {
  const driver = new FakeUpdateDriver();
  driver.failChecks = true;
  const service = createService(driver);
  service.init();
  await service.checkForUpdates("manual");
  assert.equal(service.getState().phase, "error");
  await service.checkForUpdates("manual");
  assert.equal(driver.checkCalls, 2, "the lock must be released after failure");
});

test("auto-download runs after update-available and reports progress", async () => {
  const driver = new FakeUpdateDriver();
  const stagingRoot = await mkdtemp(join(tmpdir(), "update-test-"));
  const service = createService(driver, {
    stagingRoot,
    download: async () => {
      return { bytes: 100, sha512: "hash" };
    },
    extractZip: async () => {
      await mkdir(join(stagingRoot, "0.2.0", "Coolto.app"), {
        recursive: true,
      });
    },
  });
  service.init();
  driver.emit("update-available", {
    version: "0.2.0",
    files: [{ url: "Coolto-0.2.0.zip", sha512: "hash", size: 100 }],
  });
  await sleep(20);
  const state = service.getState();
  assert.equal(state.phase, "downloaded");
  assert.equal(state.updateVersion, "0.2.0");
  assert.equal(driver.autoDownload, false, "driver must not auto-download");
});

test("download failure lands in the install error phase", async () => {
  const driver = new FakeUpdateDriver();
  const service = createService(driver, {
    download: async () => {
      throw new Error("network down");
    },
  });
  service.init();
  driver.emit("update-available", {
    version: "0.2.0",
    files: [{ url: "Coolto-0.2.0.zip" }],
  });
  await sleep(10);
  assert.equal(service.getState().phase, "error");
  assert.equal(service.getState().errorStage, "install");
});

test("install in dev mode is fail-closed", async () => {
  const driver = new FakeUpdateDriver();
  const stagingRoot = await mkdtemp(join(tmpdir(), "update-test-"));
  const service = createService(driver, {
    isPackaged: false,
    stagingRoot,
    download: async () => ({ bytes: 1, sha512: "hash" }),
    extractZip: async () => {
      await mkdir(join(stagingRoot, "0.2.0", "Coolto.app"), {
        recursive: true,
      });
    },
  });
  service.init();
  driver.emit("update-available", {
    version: "0.2.0",
    files: [{ url: "Coolto-0.2.0.zip" }],
  });
  await sleep(20);
  assert.equal(service.getState().phase, "downloaded");
  service.install();
  assert.equal(service.getState().phase, "error");
  assert.equal(service.getState().errorStage, "install");
  assert.match(service.getState().message ?? "", /开发模式/);
});

test("install without a downloaded update is a no-op", () => {
  const driver = new FakeUpdateDriver();
  let quitCalls = 0;
  const service = createService(driver, {
    quit: () => {
      quitCalls += 1;
    },
  });
  service.init();
  service.install();
  assert.equal(quitCalls, 0);
  assert.equal(service.getState().phase, "idle");
});

test("checkPendingInstall is skipped in dev mode", async () => {
  const driver = new FakeUpdateDriver();
  const service = createService(driver, { isPackaged: false });
  await service.checkPendingInstall();
  assert.equal(service.getState().phase, "idle");
});

function createService(
  driver: UpdateDriver,
  overrides: Partial<Parameters<typeof createServiceBase>[1]> = {},
): ElectronUpdateService {
  return createServiceBase(driver, overrides);
}

function createServiceBase(
  driver: UpdateDriver,
  overrides: Partial<ConstructorParameters<typeof ElectronUpdateService>[1]> = {},
): ElectronUpdateService {
  return new ElectronUpdateService(driver, {
    feedUrl: "http://127.0.0.1:8099",
    currentVersion: () => "0.1.0",
    isPackaged: true,
    exePath: () => "/Applications/Coolto.app/Contents/MacOS/Coolto",
    stagingRoot: "/tmp/update-staging-test",
    quit: () => undefined,
    ...overrides,
  });
}

function apply(
  initial: ReturnType<typeof initialState>,
  ...events: UpdateStateEvent[]
): ReturnType<typeof initialState> {
  return events.reduce(reduceUpdateState, initial);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeUpdateDriver implements UpdateDriver {
  public autoDownload = true;
  public forceDevUpdateConfig = false;
  public checkCalls = 0;
  public failChecks = false;
  private readonly handlers = new Map<
    keyof UpdateDriverEventMap,
    Array<(payload?: unknown) => void>
  >();

  public setFeedURL(_url: string): void {}

  public async checkForUpdates(): Promise<void> {
    this.checkCalls += 1;
    if (this.failChecks) throw new Error("feed unreachable");
  }

  public on<Event extends keyof UpdateDriverEventMap>(
    event: Event,
    listener: UpdateDriverEventMap[Event],
  ): unknown {
    const list = this.handlers.get(event) ?? [];
    list.push(listener as (payload?: unknown) => void);
    this.handlers.set(event, list);
    return undefined;
  }

  public emit<Event extends keyof UpdateDriverEventMap>(
    event: Event,
    payload?: Parameters<UpdateDriverEventMap[Event]>[0],
  ): void {
    for (const listener of this.handlers.get(event) ?? []) {
      listener(payload);
    }
  }
}
