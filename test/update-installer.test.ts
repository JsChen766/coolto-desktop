import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  buildReplaceScript,
  findAppBundleInStaging,
  findPendingBackup,
  locateAppBundle,
} from "../src/desktop/main/update/update-installer.js";

const execFileAsync = promisify(execFile);
const bashIntegration = {
  skip: process.platform === "win32" ? "requires /bin/bash" : false,
};

test("locateAppBundle climbs from the executable to the bundle", () => {
  assert.equal(
    locateAppBundle("/Applications/Coolto.app/Contents/MacOS/Coolto"),
    "/Applications/Coolto.app",
  );
});

test("buildReplaceScript contains backup, replace, recovery and cleanup steps", () => {
  const { script } = buildReplaceScript({
    appPath: "/Applications/Coolto.app",
    exePath: "/Applications/Coolto.app/Contents/MacOS/Coolto",
    stagingDir: "/tmp/staging",
    appName: "Coolto.app",
    zipName: "update.zip",
    launchCommand: "echo",
  });
  assert.match(script, /mv "\$APP" "\$BACKUP"/, "backs up the old app");
  assert.match(script, /mv "\$NEW_APP" "\$APP"/, "installs the new app");
  assert.match(script, /mv "\$BACKUP" "\$APP"/, "recovers the backup");
  assert.match(script, /rm -rf "\$STAGED\/backup"/, "cleans the backup on success");
  assert.match(script, /pgrep -f/, "waits for the old process to exit");
  assert.ok(
    script.includes("pgrep -f '[/]"),
    "self-match-safe pgrep pattern",
  );
});

test("replace script swaps the bundle and relaunches", bashIntegration, async () => {
  const dir = await mkdtemp(join(tmpdir(), "update-install-"));
  try {
    const appDir = join(dir, "Applications");
    const staging = join(dir, "staging");
    await mkdir(join(appDir, "Coolto.app", "Contents"), { recursive: true });
    await writeFile(join(appDir, "Coolto.app", "Contents", "Info.plist"), "old");
    await mkdir(join(staging, "Coolto.app", "Contents"), { recursive: true });
    await writeFile(join(staging, "Coolto.app", "Contents", "Info.plist"), "new");
    await writeFile(join(staging, "update.zip"), "zip");

    const { script, scriptPath } = buildReplaceScript({
      appPath: join(appDir, "Coolto.app"),
      exePath: join(appDir, "Coolto.app", "Contents", "MacOS", "Coolto"),
      stagingDir: staging,
      appName: "Coolto.app",
      zipName: "update.zip",
      launchCommand: "echo",
    });
    await writeFile(scriptPath, script, { mode: 0o755 });
    await execFileAsync("/bin/bash", [scriptPath]);

    const replaced = await readFile(
      join(appDir, "Coolto.app", "Contents", "Info.plist"),
      "utf8",
    );
    assert.equal(replaced, "new");
    await assert.rejects(
      stat(join(staging, "Coolto.app")),
      "staged bundle must be removed after install",
    );
    await assert.rejects(
      stat(join(staging, "backup")),
      "backup must be removed after successful install",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("replace script recovers the backup when the new app is missing", bashIntegration, async () => {
  const dir = await mkdtemp(join(tmpdir(), "update-install-"));
  try {
    const appDir = join(dir, "Applications");
    const staging = join(dir, "staging");
    await mkdir(join(appDir, "Coolto.app", "Contents"), { recursive: true });
    await writeFile(join(appDir, "Coolto.app", "Contents", "Info.plist"), "old");
    await mkdir(staging, { recursive: true });

    const { script, scriptPath } = buildReplaceScript({
      appPath: join(appDir, "Coolto.app"),
      exePath: join(appDir, "Coolto.app", "Contents", "MacOS", "Coolto"),
      stagingDir: staging,
      appName: "Coolto.app",
      zipName: "update.zip",
      launchCommand: "echo",
    });
    await writeFile(scriptPath, script, { mode: 0o755 });
    await assert.rejects(execFileAsync("/bin/bash", [scriptPath]));

    const restored = await readFile(
      join(appDir, "Coolto.app", "Contents", "Info.plist"),
      "utf8",
    );
    assert.equal(restored, "old", "backup must be restored");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("findPendingBackup detects leftover backups and findAppBundleInStaging scans bundles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "update-install-"));
  try {
    await mkdir(join(dir, "0.2.0", "backup", "Coolto.app"), {
      recursive: true,
    });
    assert.equal(await findPendingBackup(dir), join(dir, "0.2.0"));
    assert.equal(
      await findAppBundleInStaging(join(dir, "0.2.0", "backup")),
      join(dir, "0.2.0", "backup", "Coolto.app"),
    );
    assert.equal(await findPendingBackup(join(dir, "missing")), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
