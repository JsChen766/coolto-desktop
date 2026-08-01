import assert from "node:assert/strict";
import test from "node:test";

// login.ts now uses interactive email OTP flow — non-interactive env-var
// credential reading has been removed. This file is kept as a placeholder.

test("login module exists", async () => {
  const mod = await import("../src/cli/login.js");
  assert.equal(typeof mod.performEmailOtpLogin, "function");
});
