import { app } from "electron";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";

import { AgentHarnessServices } from "../agent-task/agent-harness-services.js";
import { AgentHarnessStateRepository } from "../agent-task/agent-harness-state-repository.js";
import { ElectronAgentHarnessPersistence } from "../desktop/main/agent-task/electron-agent-harness-persistence.js";
import { ElectronAgentEvidenceStore } from "../desktop/main/agent-task/electron-agent-evidence-store.js";
import {
  ElectronMailConnectionService,
  type MailConnectionOAuthDependencies,
} from "../desktop/main/mail-connections/electron-mail-connection-service.js";
import { runOAuthLoopback } from "../desktop/main/mail-connections/oauth-loopback.js";

interface QaResult { name: string; passed: boolean }
const results: QaResult[] = [];
const keepAlive = setInterval(() => {}, 1_000);
const expect = (name: string, passed: boolean): void => {
  results.push({ name, passed });
  if (!passed) throw new Error(`QA failed: ${name}`);
};

app.whenReady().then(async () => {
  const ownerId = "qa-owner-a";
  const persistence = new ElectronAgentHarnessPersistence(ownerId);
  const evidenceStore = new ElectronAgentEvidenceStore(ownerId);
  const repository = new AgentHarnessStateRepository(ownerId, persistence);
  const services = new AgentHarnessServices(ownerId, repository, evidenceStore);
  try {
    const first = await provision(services, "conversation-a", "Monitor roles");
    const run = await services.tasks.startRun({ taskId: first.id, wakeCause: "user" });
    expect("01 task becomes running", run.status === "running");
    const event = await services.events.enqueue({
      taskId: first.id, source: "timer", type: "timer.ready",
      trust: "trusted_system", occurredAt: new Date().toISOString(),
      dedupeKey: "timer:qa", payloadRef: null, payloadHash: "hash",
    });
    await services.events.markDelivered(event.id);
    expect("02 delivered event remains replayable", (await services.events.pending(first.id))[0]?.status === "delivered");

    const encrypted = await readStateFile(ownerId);
    expect("03 safeStorage file hides task goal", !encrypted.includes("Monitor roles"));
    const restored = new AgentHarnessServices(
      ownerId,
      new AgentHarnessStateRepository(ownerId, new ElectronAgentHarnessPersistence(ownerId)),
    );
    expect("04 restart restores task", (await restored.tasks.get(first.id)).goal === "Monitor roles");
    expect("05 restart restores unacked event", (await restored.events.pending(first.id)).length === 1);
    const recovered = await restored.tasks.recoverInterruptedRuns();
    expect("06 interrupted run recovers paused", recovered[0]?.status === "paused");

    const second = await provision(restored, "conversation-b", "Track updates");
    await restored.tasks.startRun({ taskId: second.id, wakeCause: "user" });
    const started = performance.now();
    await restored.grants.revoke(second.id, "user");
    expect("07 grant revocation persists under one second", performance.now() - started < 1_000);

    const foreign = new AgentHarnessServices(
      "qa-owner-b",
      new AgentHarnessStateRepository(
        "qa-owner-b",
        new ElectronAgentHarnessPersistence("qa-owner-b"),
      ),
    );
    expect("08 owner isolation hides tasks", (await foreign.tasks.list()).length === 0);
    const evidence = await evidenceStore.save({
      taskId: first.id, runId: run.id, kind: "browser_observation",
      payloadHash: "payload-hash", payload: { screenshot: "private-image" },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    expect("09 encrypted evidence round-trips", (await evidenceStore.read(evidence.id))?.payloadHash === "payload-hash");
    expect("10 evidence file hides screenshot", !(await readEvidenceFile(ownerId, evidence.id)).includes("private-image"));
    let refreshCalls = 0;
    const oauth: MailConnectionOAuthDependencies = {
      provider: (provider) => provider === "gmail" ? {
        provider, clientId: "qa-client", authorizationEndpoint: "https://auth.example",
        tokenEndpoint: "https://token.example", scopes: ["gmail.readonly"],
        accountEmail: async () => "qa-mail@example.com",
      } : undefined,
      authorize: async () => ({
        accessToken: "private-access-token", refreshToken: "private-refresh-token",
        expiresIn: 3600, scope: "gmail.readonly",
      }),
      refresh: async () => {
        refreshCalls += 1;
        return { accessToken: "refreshed-access-token", refreshToken: "rotated-refresh-token",
          expiresIn: 3600, scope: "gmail.readonly" };
      },
    };
    const mail = new ElectronMailConnectionService(ownerId, oauth);
    const connected = await mail.connect("gmail");
    expect("11 mail connection view never exposes tokens",
      !JSON.stringify(connected).includes("token") && connected.accountEmail === "qa-mail@example.com");
    expect("12 safeStorage mail file hides refresh token",
      !(await readMailConnectionFile(ownerId)).includes("private-refresh-token"));
    const restoredMail = new ElectronMailConnectionService(ownerId, oauth);
    expect("13 encrypted mail connection restores by owner",
      (await restoredMail.list())[0]?.accountEmail === "qa-mail@example.com");
    expect("14 restored connection refreshes without renderer token access",
      await (await restoredMail.get(connected.id)).accessToken() === "refreshed-access-token" &&
      refreshCalls === 1);
    const pkce = await runPkceQa();
    expect("15 OAuth loopback validates state and returns tokens",
      pkce.accessToken === "pkce-access" && pkce.refreshToken === "pkce-refresh");
    expect("16 OAuth loopback sends a matching PKCE verifier", pkce.verifierMatched);
    await restoredMail.clearAll();
    await services.clearAll();
    await foreign.clearAll();
    await emitReport({
      passed: results.length,
      runtime: { electron: process.versions.electron, platform: process.platform },
      results,
    });
  } catch (error) {
    await emitReport({ passed: results.length, results,
      error: error instanceof Error ? error.stack : String(error) }).catch(() => {});
    throw error;
  } finally {
    clearInterval(keepAlive);
    app.quit();
  }
}).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  clearInterval(keepAlive);
  app.exit(1);
});

async function provision(
  services: AgentHarnessServices,
  conversationId: string,
  goal: string,
) {
  const now = Date.now();
  return (await services.tasks.provision({
    conversationId,
    goal,
    grant: {
      allowedDomains: ["jobs.example"], blockedDomains: [],
      allowedActions: ["browser.read", "task.lifecycle"],
      jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
      unattended: true, validFrom: new Date(now - 1_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be2-qa",
    },
    confirmedByUserAt: new Date(now).toISOString(),
  })).task;
}

async function readStateFile(ownerId: string): Promise<string> {
  const ownerHash = createHash("sha256").update(ownerId).digest("hex").slice(0, 20);
  return (await readFile(join(
    app.getPath("userData"), "agent-harness", ownerHash, "state.coolto",
  ))).toString("utf8");
}

async function readEvidenceFile(ownerId: string, evidenceId: string): Promise<string> {
  const ownerHash = createHash("sha256").update(ownerId).digest("hex").slice(0, 20);
  return (await readFile(join(
    app.getPath("userData"), "agent-evidence", ownerHash, `${evidenceId}.coolto`,
  ))).toString("utf8");
}

async function readMailConnectionFile(ownerId: string): Promise<string> {
  const ownerHash = createHash("sha256").update(ownerId).digest("hex").slice(0, 20);
  return (await readFile(join(
    app.getPath("userData"), "mail-connections", ownerHash, "connections.coolto",
  ))).toString("utf8");
}

function emitReport(value: unknown): Promise<void> {
  const path = process.env.COOLTO_AGENT_HARNESS_QA_REPORT;
  return path ? writeFile(path, JSON.stringify(value, null, 2), "utf8") : Promise.resolve();
}

async function runPkceQa(): Promise<{
  accessToken: string; refreshToken: string; verifierMatched: boolean;
}> {
  let challenge = "";
  let verifierMatched = false;
  const tokenServer = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      const verifier = form.get("code_verifier") ?? "";
      verifierMatched = createHash("sha256").update(verifier).digest("base64url") === challenge;
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
        access_token: "pkce-access", refresh_token: "pkce-refresh",
        expires_in: 3600, scope: "mail.read",
      }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    tokenServer.once("error", reject);
    tokenServer.listen(0, "127.0.0.1", resolve);
  });
  const address = tokenServer.address();
  if (!address || typeof address === "string") throw new Error("token QA server failed");
  try {
    const tokens = await runOAuthLoopback({
      authorizationEndpoint: "https://auth.example/authorize",
      tokenEndpoint: `http://127.0.0.1:${address.port}/token`,
      clientId: "qa-client", scopes: ["mail.read"],
      openExternal: async (value) => {
        const authorization = new URL(value);
        challenge = authorization.searchParams.get("code_challenge") ?? "";
        const callback = new URL(authorization.searchParams.get("redirect_uri")!);
        callback.searchParams.set("code", "qa-code");
        callback.searchParams.set("state", authorization.searchParams.get("state")!);
        const response = await fetch(callback);
        if (!response.ok) throw new Error("OAuth callback QA failed");
      },
    });
    return { ...tokens, verifierMatched };
  } finally { tokenServer.close(); }
}
