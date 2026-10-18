import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { CooltoApiClient } from "../src/api/coolto-api-client.js";
import { cliDeviceId } from "../src/cli/cli-profile-writer.js";
import { loadLocalEnv, readConfig } from "../src/config.js";

loadLocalEnv();
const config = readConfig();
const client = new CooltoApiClient({ baseUrl: config.apiBaseUrl });
const deviceId = await cliDeviceId();
const challengeId = randomUUID();
const email = process.env.COOLTO_OTP_EMAIL ?? "you@example.com";
const challenge = await client.requestEmailChallenge({
  challengeId,
  email,
  purpose: "login",
  device: {
    id: deviceId,
    name: hostname(),
    platform: "windows",
    appVersion: "0.1.0",
  },
});
console.log(`challengeId=${challengeId}`);
console.log(`expiresAt=${challenge.expiresAt}`);
console.log(`验证码已发送至 ${email}，请把收到的验证码告诉我`);
