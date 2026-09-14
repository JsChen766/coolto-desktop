import { app } from "electron";

import { loadLocalEnv } from "../config.js";
import { ElectronAuthSessionStore } from "../desktop/main/electron-auth-session-store.js";
import { LocalSyncStore } from "../desktop/main/sync/local-sync-store.js";
import { createProfileLocalPayloadMerger } from "../desktop/main/profile/profile-local-sync-adapter.js";
import { ResumeSyncStore } from "../desktop/main/resume-library/resume-sync-store.js";
import { createReadySaveFixture } from "../../test/support/resume-save-fixture.js";

const API_BASE = "http://127.0.0.1:8080";

async function run(): Promise<void> {
  await app.whenReady();
  loadLocalEnv();
  const session = await new ElectronAuthSessionStore(API_BASE).load();
  if (!session?.currentUser?.id) {
    throw new Error("run run-dev-desktop-login.mjs first");
  }
  const store = await LocalSyncStore.open(
    API_BASE,
    session.currentUser.id,
    createProfileLocalPayloadMerger,
  );
  const trigger = () => undefined;
  const initialSync = async () => undefined;
  const resumes = new ResumeSyncStore(store, trigger, initialSync, async () => undefined);
  const { proposalBuilder, ready } = await createReadySaveFixture();
  const payload = proposalBuilder.build({
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "QA 通用简历（实测）",
    mode: "new_resume",
  });
  const published = await resumes.publishNew(payload, "qa-seed-resume-general");
  const total = store.listEntities("resume").filter((e) => e.operation !== "delete").length;
  console.log(`QA_RESUME_SEED_OK id=${published.id} totalActive=${total}`);
  app.quit();
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
