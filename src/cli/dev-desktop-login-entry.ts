import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";

import { app, safeStorage } from "electron";

import { createUuidV7 } from "../sync/uuid-v7.js";
import { BUNDLED_PRIVACY_POLICY } from "../privacy/policy.js";

const DEFAULT_EMAIL = "dev@example.com";
const DEFAULT_PASSWORD = "devpassword";

async function run(): Promise<void> {
  await app.whenReady();
  const apiBaseUrl = (process.env.COOLTO_API_BASE_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
  const email = (process.env.COOLTO_DEV_LOGIN_EMAIL ?? DEFAULT_EMAIL).trim();
  const password = process.env.COOLTO_DEV_LOGIN_PASSWORD ?? DEFAULT_PASSWORD;
  const device = { id: createUuidV7() };
  const loginRes = await fetch(`${apiBaseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      device: {
        id: device.id,
        name: hostname().trim().slice(0, 120) || "Coolto Desktop",
        platform: process.platform === "darwin" ? "macos" : "windows",
        appVersion: process.env.npm_package_version ?? "0.1.26",
      },
    }),
  });
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status} ${await loginRes.text()}`);
  const accessToken = extractAccessToken(loginRes.headers);
  if (!accessToken) throw new Error("login response missing access_token cookie");
  const loginBody = (await loginRes.json()) as { data: { userId: string; email: string } };
  const cookie = `access_token=${accessToken}`;
  await recordDevPrivacyConsent(apiBaseUrl, cookie, device.id);
  const meRes = await fetch(`${apiBaseUrl}/v1/users/me`, { headers: { cookie } });
  if (!meRes.ok) throw new Error(`users/me failed: ${meRes.status}`);
  const meBody = (await meRes.json()) as { data: { id: string; email: string; deviceId?: string } };
  const user = {
    id: meBody.data.id ?? loginBody.data.userId,
    email: meBody.data.email ?? loginBody.data.email,
    deviceId: meBody.data.deviceId ?? device.id,
    status: "active" as const,
  };
  await saveSession(apiBaseUrl, accessToken, user);
  console.log(`DEV_DESKTOP_LOGIN_OK email=${user.email} api=${apiBaseUrl}`);
  app.quit();
}

async function recordDevPrivacyConsent(
  apiBaseUrl: string,
  cookie: string,
  deviceId: string,
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/users/me/privacy/consent`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "idempotency-key": `dev-desktop-login-${Date.now()}`,
    },
    body: JSON.stringify({
      policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
      contentHash: BUNDLED_PRIVACY_POLICY.contentHash,
      decision: "accept",
      deviceId,
      appVersion: process.env.npm_package_version ?? "0.1.26",
    }),
  });
  if (!res.ok) {
    if (res.status === 404) {
      console.warn(
        `privacy consent skipped (${res.status}) — ${apiBaseUrl}/v1/users/me/privacy/consent not on server`,
      );
      return;
    }
    throw new Error(`privacy consent failed: ${res.status} ${await res.text()}`);
  }
}

function extractAccessToken(headers: Headers): string | undefined {
  const raw = headers.get("set-cookie") ?? "";
  const match = /(?:^|,\s*)access_token=([^;,\s]+)/.exec(raw);
  return match?.[1];
}

async function saveSession(
  apiBaseUrl: string,
  accessToken: string,
  user: { id: string; email: string; deviceId: string; status: "active" },
): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("safeStorage unavailable");
  const path = join(app.getPath("userData"), "auth", "session.coolto");
  const session = { version: 1, apiBaseUrl, accessToken, currentUser: user };
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, safeStorage.encryptString(JSON.stringify(session)), { mode: 0o600 });
  await rename(tmp, path);
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
