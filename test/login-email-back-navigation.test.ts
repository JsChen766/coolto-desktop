import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("OTP login can return to editable email entry", async () => {
  const [screen, app, auth, styles, messages] = await Promise.all([
    source("../src/desktop/renderer/src/components/LoginScreen.vue"),
    source("../src/desktop/renderer/src/App.vue"),
    source("../src/desktop/renderer/src/chat/use-chat-auth.ts"),
    source("../src/desktop/renderer/src/styles/base-login.css"),
    source("../src/desktop/renderer/src/i18n/catalog-resume-agent.ts"),
  ]);

  assert.match(screen, /v-if="challenge"[\s\S]*class="login-back-button"/u);
  assert.match(screen, /<ArrowLeft :size="14"/u);
  assert.match(screen, /@click="changeEmail"/u);
  assert.match(screen, /function changeEmail[\s\S]*code\.value = ""/u);
  assert.match(screen, /emailInput\.value\?\.focus\(\)/u);
  assert.match(screen, /emailInput\.value\?\.select\(\)/u);
  assert.doesNotMatch(app, /LoginScreen/u);
  assert.match(app, /无法初始化本机工作区/u);
  assert.match(auth, /function resetEmailChallenge[\s\S]*emailChallenge\.value = undefined/u);
  assert.match(auth, /function resetEmailChallenge[\s\S]*loginError\.value = undefined/u);
  assert.match(styles, /\.login-back-button:focus-visible/u);
  assert.match(messages, /"修改邮箱": "Change email"/u);
});
