import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { CooltoApiClient } from "../api/coolto-api-client.js";
import type { UserProfile } from "../api/types.js";
import { toProfileWritePayload } from "../desktop/main/profile/profile-sync-mapping.js";

const DEVICE_ID_PATH = join(homedir(), ".coolto-cli", "device-id");

/**
 * Persisted CLI device identity (stable across runs, mirrors the desktop
 * device-identity-store). Used as the sync deviceId for /v1/sync/push.
 * The parent directory is created on demand so the id survives across runs.
 */
export async function cliDeviceId(): Promise<string> {
  await mkdir(dirname(DEVICE_ID_PATH), { recursive: true }).catch(
    () => undefined,
  );
  try {
    const existing = (await readFile(DEVICE_ID_PATH, "utf8")).trim();
    if (existing) return existing;
  } catch {
    // first run
  }
  const id = randomUUID();
  await writeFile(DEVICE_ID_PATH, id, { flag: "wx" }).catch(() => undefined);
  return id;
}

/**
 * Pushes a profile update to the server through the generic sync protocol
 * (entityType "user_profile" / action "update"), the same channel the
 * desktop app uses.
 *
 * The session token is bound to the device registered at login; the server
 * rejects pushes carrying any other deviceId (403 device_mismatch). The
 * authoritative device of a session is currentUser.deviceId, so it is used
 * first (same as the desktop app), falling back to the persisted CLI
 * identity only when the server does not report one.
 *
 * The CLI has no local sync projection, so the expected entity version is
 * read from the bootstrap feed instead of null (the server requires a real
 * version for profile updates). The deployed profile protocol does not carry
 * contactEmail (the account email serves as the resume header email), so the
 * field is omitted from the payload to avoid invalid_profile.
 */
export async function pushProfileUpdate(
  client: CooltoApiClient,
  profile: UserProfile,
  sessionDeviceId?: string,
): Promise<void> {
  const currentUser = await client.getCurrentUser();
  const deviceId =
    currentUser.deviceId ?? sessionDeviceId ?? (await cliDeviceId());
  const page = await client.sync.bootstrap(deviceId);
  const profileChange = page.changes.find(
    (change) => change.entityType === "user_profile",
  );
  const expectedVersion = profileChange?.entityVersion ?? 0;
  const { contactEmail: _contactEmail, ...payload } =
    toProfileWritePayload(profile);
  const result = await client.sync.push(
    deviceId,
    [
      {
        operationId: randomUUID(),
        entityType: "user_profile",
        entityId: currentUser.id,
        action: "update",
        expectedVersion,
        payload,
      },
    ],
    randomUUID(),
  );
  const outcome = result.results[0];
  if (!outcome) {
    throw new Error("同步服务未返回操作结果");
  }
  if (outcome.status === "conflict") {
    throw new Error("个人资料与服务器版本冲突，请重新解析附件后确认");
  }
  if (outcome.status !== "applied" && outcome.status !== "already_applied") {
    throw new Error(
      `个人资料同步失败：${outcome.status}${outcome.errorCode ? `（${outcome.errorCode}）` : ""}`,
    );
  }
}
