import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CooltoApiClient } from "../src/api/coolto-api-client.js";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("control-token transport uses POST deletion header without normal session cookie", async () => {
  const captured: Headers[] = [];
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async (_input, init) => {
      captured.push(new Headers(init?.headers));
      return jsonResponse({ requestId: "request-1", status: "acknowledged" });
    },
  });

  client.restoreSession("normal.session.token");
  const result = await client.requestControl<{ requestId: string }>(
    "/v1/users/me/deletion-requests/request-1/confirm",
    "opaque-control-token",
    { method: "POST" },
  );
  const replay = await client.requestAckReplay<{ requestId: string }>(
    "/v1/users/me/deletion-requests/request-1/ack",
    "ack-key",
    { method: "POST" },
  );

  assert.deepEqual(result, { requestId: "request-1", status: "acknowledged" });
  assert.deepEqual(replay, { requestId: "request-1", status: "acknowledged" });
  assert.equal(captured[0]?.get("X-Coolto-Deletion-Control"), "opaque-control-token");
  assert.equal(captured[0]?.get("cookie"), null);
  assert.equal(captured[1]?.get("X-Coolto-Deletion-Control"), null);
  assert.equal(captured[1]?.get("Idempotency-Key"), "ack-key");
  assert.equal(captured[1]?.get("cookie"), null);
});

test("DesktopApi privacy surface has no control-token return or input field", async () => {
  const desktopApiSource = await readFile(
    new URL("../src/desktop/shared/types/desktop-api.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(desktopApiSource, /deletionControlToken|X-Coolto-Deletion-Control/u);
});
