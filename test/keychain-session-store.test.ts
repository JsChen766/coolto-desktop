import assert from "node:assert/strict";
import test from "node:test";

import { KeychainSessionStore } from "../src/auth/keychain-session-store.js";

test("session store serializes only the backend session into secure storage", async () => {
  let secret: string | undefined;
  const entry = {
    getPassword: async () => secret,
    setPassword: async (value: string) => {
      secret = value;
    },
    deleteCredential: async () => {
      const existed = secret !== undefined;
      secret = undefined;
      return existed;
    },
  };
  const store = new KeychainSessionStore({
    apiBaseUrl: "http://127.0.0.1:8000/",
    entry,
  });

  await store.save({
    version: 1,
    apiBaseUrl: "http://127.0.0.1:8000",
    accessToken: "header.payload.signature",
  });

  assert.deepEqual(await store.load(), {
    version: 1,
    apiBaseUrl: "http://127.0.0.1:8000",
    accessToken: "header.payload.signature",
  });
  assert.doesNotMatch(secret ?? "", /password/i);

  await store.clear();
  assert.equal(await store.load(), undefined);
});

test("session store removes malformed local credentials", async () => {
  let secret: string | undefined = "{\"accessToken\":\"bad;cookie\"}";
  let deleted = false;
  const store = new KeychainSessionStore({
    apiBaseUrl: "http://127.0.0.1:8000",
    entry: {
      getPassword: async () => secret,
      setPassword: async (value: string) => {
        secret = value;
      },
      deleteCredential: async () => {
        deleted = true;
        secret = undefined;
        return true;
      },
    },
  });

  assert.equal(await store.load(), undefined);
  assert.equal(deleted, true);
});
