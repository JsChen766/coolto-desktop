import assert from "node:assert/strict";
import test from "node:test";

import { PRIVACY_POLICY_VERSION } from "../src/privacy/types.js";

test("privacy contract pins the accepted policy version and deletion phase", () => {
  assert.equal(PRIVACY_POLICY_VERSION, "privacy-2026-09-08-v1");
});
