import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { app, ipcMain } from "electron";

import { loadLocalEnv } from "../config.js";
import { ElectronAuthSessionStore } from "../desktop/main/electron-auth-session-store.js";
import { ElectronResumeCompilerService } from "../desktop/main/resume-compiler-service.js";
import { createElectronResumeDraftRepository } from "../desktop/main/resume-drafts/electron-draft-repository.js";
import { createLocalResumeDraft } from "../resume/draft/projection.js";
import { createQaChromiumQualifiedWorkspace } from "../../test/support/qa-pdf-seed-fixture.js";

export const QA_LOCAL_DRAFT_ARTIFACT_ID = "00000000-0000-4000-8000-000000000099";

async function run(): Promise<void> {
  loadLocalEnv();
  const apiBase = (process.env.COOLTO_API_BASE_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
  const session = await new ElectronAuthSessionStore(apiBase).load();
  if (!session?.currentUser?.id) {
    throw new Error("run run-dev-desktop-login.mjs first");
  }
  const compiler = new ElectronResumeCompilerService(ipcMain);
  let ready;
  try {
    ready = await createQaChromiumQualifiedWorkspace(compiler);
    const repo = createElectronResumeDraftRepository(apiBase, session.currentUser.id);
    const draft = createLocalResumeDraft({
      ownerId: session.currentUser.id,
      conversationId: randomUUID(),
      artifactId: QA_LOCAL_DRAFT_ARTIFACT_ID,
      workspace: ready,
    });
    await repo.save(draft);
    writeFileSync(
      join(app.getPath("userData"), "qa-seed-marker.txt"),
      `bullets=${ready.compileResult.bullets.length} hash=${ready.compileResult.profileHash}\n`,
    );
    console.log(
      `QA_LOCAL_DRAFT_SEED_OK artifactId=${QA_LOCAL_DRAFT_ARTIFACT_ID} status=${ready.status} qualified=${ready.compileResult.qualified}`,
    );
  } finally {
    compiler.dispose();
  }
  app.quit();
}

app.whenReady().then(run).catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
  app.exit(1);
});
