import assert from "node:assert/strict";
import test from "node:test";

import { CooltoApiClient } from "../src/api/coolto-api-client.js";
import { ensureAuthenticated } from "../src/auth/session-manager.js";
import type {
  AuthSessionStore,
  StoredAuthSession,
} from "../src/auth/session-store.js";

test("first login stores a reusable session without storing credentials", async () => {
  const store = new MemorySessionStore();
  const requestedPaths: string[] = [];
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async (input, init) => {
      const path = new URL(String(input)).pathname;
      requestedPaths.push(path);

      if (path === "/v1/auth/login") {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          email: "alice@example.com",
          password: "secret",
        });
        return jsonResponse(
          {
            success: true,
            data: { userId: "user-1", email: "alice@example.com" },
          },
          {
            headers: {
              "set-cookie":
                "access_token=header.payload.signature; HttpOnly; Path=/",
            },
          },
        );
      }

      return jsonResponse({
        success: true,
        data: { id: "user-1", email: "alice@example.com" },
      });
    },
  });

  const result = await ensureAuthenticated(
    client,
    store,
    "http://localhost:8000",
    async () => ({
      email: "alice@example.com",
      password: "secret",
    }),
  );

  assert.equal(result.restored, false);
  assert.equal(store.session?.accessToken, "header.payload.signature");
  assert.equal(JSON.stringify(store.session).includes("secret"), false);
  assert.deepEqual(requestedPaths, [
    "/v1/auth/login",
    "/v1/users/me",
  ]);
});

test("valid stored session skips the credential prompt", async () => {
  const store = new MemorySessionStore({
    version: 1,
    apiBaseUrl: "http://localhost:8000",
    accessToken: "stored.token.signature",
  });
  let prompted = false;
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async (_input, init) => {
      assert.equal(
        new Headers(init?.headers).get("cookie"),
        "access_token=stored.token.signature",
      );
      return jsonResponse({
        success: true,
        data: { id: "user-1", email: "alice@example.com" },
      });
    },
  });

  const result = await ensureAuthenticated(
    client,
    store,
    "http://localhost:8000",
    async () => {
      prompted = true;
      return { email: "", password: "" };
    },
  );

  assert.equal(result.restored, true);
  assert.equal(prompted, false);
});

class MemorySessionStore implements AuthSessionStore {
  public constructor(
    public session?: StoredAuthSession,
  ) {}

  public load(): Promise<StoredAuthSession | undefined> {
    return Promise.resolve(this.session);
  }

  public save(session: StoredAuthSession): Promise<void> {
    this.session = session;
    return Promise.resolve();
  }

  public clear(): Promise<void> {
    this.session = undefined;
    return Promise.resolve();
  }
}

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...Object.fromEntries(new Headers(init.headers)),
    },
  });
}
