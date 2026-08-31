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

function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}
