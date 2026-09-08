import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("macOS package declares Calendar privacy and protocol contracts", async () => {
  const [builder, entitlements] = await Promise.all([
    source("../electron-builder.yml"), source("../build/entitlements.mac.plist"),
  ]);
  assert.match(builder, /NSCalendarsWriteOnlyAccessUsageDescription/u);
  assert.match(builder, /NSCalendarsFullAccessUsageDescription/u);
  assert.match(builder, /schemes:\s*\r?\n\s*- coolto/u);
  assert.match(entitlements, /personal-information\.calendars/u);
});

test("native core links EventKit without a helper process", async () => {
  const [build, bridge, rust] = await Promise.all([
    source("../native/coolto-core/build.rs"),
    source("../native/coolto-core/src/calendar_bridge.m"),
    source("../native/coolto-core/src/calendar.rs"),
  ]);
  assert.match(build, /rustc-link-lib=framework=EventKit/u);
  assert.match(bridge, /requestWriteOnlyAccessToEventsWithCompletion/u);
  assert.match(bridge, /saveEvent:event span:EKSpanThisEvent/u);
  assert.match(rust, /calendarRequestAccess/u);
});

test("macOS native build and release gates execute the Calendar export", async () => {
  const [nativeBuild, releaseAudit, runtimeAudit] = await Promise.all([
    source("../scripts/build-native-core.mjs"),
    source("../scripts/verify-release-hardening.mjs"),
    source("../scripts/verify-native-calendar-runtime.mjs"),
  ]);
  assert.match(nativeBuild, /verify-native-calendar-runtime\.mjs/u);
  assert.match(releaseAudit, /verifyNativeCalendarRuntime/u);
  assert.match(runtimeAudit, /calendarAuthorizationStatus/u);
  assert.match(runtimeAudit, /___isPlatformVersionAtLeast/u);
});

test("macOS development loads the same universal binding whose hash is injected", async () => {
  const [viteConfig, nativeProtection] = await Promise.all([
    source("../electron.vite.config.ts"),
    source("../src/desktop/main/native-protection.ts"),
  ]);
  assert.match(viteConfig, /coolto-core\.darwin-universal\.node/u);
  assert.match(nativeProtection, /darwin-universal/u);
});

function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}
