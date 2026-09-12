import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { AgentContextFactory } from "../src/desktop/main/agent-context-factory.js";
import { DesktopAgentRuntime } from "../src/desktop/main/agent-runtime.js";
import { createRunTerminalForContext } from "../src/desktop/main/agent-runtime-terminal.js";
import { registerResumeDraftIpc } from "../src/desktop/main/resume-drafts/resume-draft-ipc.js";
import { ResumeDraftEditingService } from "../src/desktop/main/resume-drafts/draft-editing-service.js";
import { ResumeDraftFileRepository } from "../src/desktop/main/resume-drafts/draft-file-repository.js";
import { ResumeDraftService } from "../src/desktop/main/resume-drafts/resume-draft-service.js";
import { ResumePdfExportService } from "../src/desktop/main/resume-pdf-export-service.js";
import { assertResumeWorkspaceCurrent } from "../src/desktop/main/resume-drafts/resume-conversation-restorer.js";
import { AgentRuntimeEvents } from "../src/desktop/main/agent-runtime-events.js";
import { ResumeDraftCloudLinker } from "../src/desktop/main/resume-library/resume-draft-cloud-linker.js";
import { ResumeGenerationTraceStore } from "../src/resume/performance/generation-trace-store.js";
import { createLocalResumeDraft } from "../src/resume/draft/projection.js";
import { ResumeManualEditor } from "../src/resume/draft/manual-editor.js";
import type { ResumeDraftCodec } from "../src/resume/draft/types.js";
import type { ResumeWorkspace } from "../src/resume/workspace/types.js";
import { buildDraftPdfExportPayload } from "../src/resume/export/draft-export.js";
import type { ResumePdfCompiler } from "../src/resume/export/types.js";
import { createRevisionDeliveryManifest, sameRevisionDelivery } from "../src/resume/workspace/revision-delivery-contract.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";
import { FixtureResumeCompiler, createWorkspaceSnapshotBuilder } from "./support/resume-workspace-fixture.js";

const OWNER_ID = "runtime-production-owner";
const ARTIFACT_ID = "00000000-0000-4000-8000-000000000001";
const codec: ResumeDraftCodec = {
  encode: (value) => Buffer.from(value, "utf8"),
  decode: (value) => Buffer.from(value).toString("utf8"),
};

class FakeIpcMain {
  readonly handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void {
    this.handlers.set(channel, handler);
  }
  async invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`missing handler ${channel}`);
    return await handler(undefined, ...args) as T;
  }
}

class FixturePdfCompiler extends FixtureResumeCompiler implements ResumePdfCompiler {
  async compileForPdf(structure: Parameters<ResumePdfCompiler["compile"]>[0]) {
    return { result: await this.compile(structure), pdf: Buffer.from("runtime-pdf") };
  }
}

test("approval continuation persists authoritative ready, needs, and stopped terminals", async () => {
  const { ready } = await createReadySaveFixture();
  const cases: Array<{
    expected: "ready_for_approval" | "needs_user_decision" | "stopped";
    workspace: ResumeWorkspace;
  }> = [
    { expected: "ready_for_approval", workspace: structuredClone(ready) },
    {
      expected: "needs_user_decision",
      workspace: {
        ...structuredClone(ready),
        status: "needs_user_decision",
        materialRequest: {
          kind: "agent_declared",
          reason: "awaiting_user_response",
          question: "是否还有可核验事实？",
          requestedAt: "2026-09-08T00:00:00.000Z",
          status: "awaiting_response",
        },
      },
    },
    {
      expected: "stopped",
      workspace: {
        ...structuredClone(ready),
        status: "needs_user_decision",
        materialRequest: {
          kind: "agent_declared",
          reason: "no_more_material",
          question: "是否还有可核验事实？",
          requestedAt: "2026-09-08T00:00:00.000Z",
          status: "declined",
          resolution: "user_stopped_questions",
        },
      },
    },
  ];

  for (const entry of cases) {
    let savedTerminal: { status?: string } | undefined;
    const approval = { id: `approval-${entry.expected}`, actionType: "test.approval" };
    const context = {
      agent: {
        getPendingApprovals: () => [approval],
        resolveApproval: async () => undefined,
        replaceMessages: () => undefined,
        getMessages: () => [],
      },
      workspaceStore: { latest: () => entry.workspace },
      artifactIdByCandidate: new Map([[entry.workspace.candidateId, ARTIFACT_ID]]),
      currentUserMessage: { timestamp: undefined },
    };
    const store = {
      loadMessages: async () => [],
      get: async () => ({ resumeArtifacts: [] }),
      saveMessages: async (...args: unknown[]) => {
        savedTerminal = args[5] as { status?: string } | undefined;
        return { lastRun: savedTerminal };
      },
      saveRunTerminal: async () => ({ resumeArtifacts: [] }),
    };
    const originalCreate = AgentContextFactory.prototype.create;
    AgentContextFactory.prototype.create = (() => context) as never;
    try {
      const constructorArgs = new Array(27).fill(undefined);
      constructorArgs[1] = store;
      constructorArgs[24] = async () => undefined;
      constructorArgs[25] = async () => ({ ok: true, message: "ok" });
      constructorArgs[26] = () => undefined;
      const runtime = Reflect.construct(DesktopAgentRuntime, constructorArgs) as DesktopAgentRuntime;
      await runtime.resolveApproval(
        "00000000-0000-4000-8000-000000000009",
        approval.id,
        { type: "reject" },
      );
      assert.equal(savedTerminal?.status, entry.expected);
    } finally {
      AgentContextFactory.prototype.create = originalCreate;
    }
  }
});

test("ready workspace reaches the production terminal wrapper as a visible ready state", async () => {
  const { ready } = await createReadySaveFixture();
  const terminal = createRunTerminalForContext({
    workspaceStore: { latest: () => ready },
    artifactIdByCandidate: new Map([[ready.candidateId, ARTIFACT_ID]]),
  } as never, false);

  assert.equal(terminal.status, "ready_for_approval");
  assert.equal(terminal.canContinue, false);
  assert.match(terminal.message ?? "", /预览|保存|导出/u);
});
test("declined material requests persist as stopped terminals", async () => {
  const { ready } = await createReadySaveFixture();
  const stopped = {
    ...structuredClone(ready),
    status: "needs_user_decision" as const,
    materialRequest: {
      kind: "agent_declared" as const,
      reason: "no_more_material",
      question: "是否还有可核验事实？",
      requestedAt: "2026-09-08T00:00:00.000Z",
      status: "declined" as const,
      resolution: "user_stopped_questions" as const,
    },
  };
  const terminal = createRunTerminalForContext({
    workspaceStore: { latest: () => stopped },
    artifactIdByCandidate: new Map([[ready.candidateId, ARTIFACT_ID]]),
  } as never, false);
  assert.equal(terminal.status, "stopped");
  assert.equal(terminal.canContinue, false);
  assert.match(terminal.message ?? "", /停止|保留/u);
});

test("production draft IPC freezes one delivery identity for preview, save, and PDF", async () => {
  const { ready } = await createReadySaveFixture();
  const root = await mkdtemp(join(tmpdir(), "coolto-res-runtime-wiring-"));
  const repository = new ResumeDraftFileRepository(OWNER_ID, root, codec);
  const draft = createLocalResumeDraft({
    ownerId: OWNER_ID,
    conversationId: "00000000-0000-4000-8000-000000000002",
    artifactId: ARTIFACT_ID,
    workspace: ready,
  });
  await repository.save(draft);
  const drafts = new ResumeDraftService(OWNER_ID, repository);
  const editing = new ResumeDraftEditingService(
    drafts,
    new ResumeManualEditor(new FixturePdfCompiler()),
  );
  const published: Array<Record<string, unknown>> = [];
  const exported: Array<Record<string, unknown>> = [];
  let publicationGate: Promise<void> | undefined;
  let publicationStarted: (() => void) | undefined;
  const compiler = new FixturePdfCompiler();
  const pdfPath = join(root, "product-export.pdf");
  const pdfExports = new ResumePdfExportService(
    compiler,
    { choosePath: async () => pdfPath },
    {
      verifyIntegrity: async () => ({
        valid: true,
        pageCount: 1,
        widthPoints: 595.28,
        heightPoints: 841.89,
        isA4Portrait: true,
        hasTextLayer: true,
        extractedText: "runtime",
        embeddedFontNames: ["SimSun", "TimesNewRoman"],
        missingFontNames: [],
        cjkFontNames: ["SimSun"],
        latinFontNames: ["TimesNewRoman"],
        hasTimesNewRoman: true,
        hasSimSun: true,
        violations: [],
      }),
      writer: { write: async () => undefined },
    },
  );
  const ipc = new FakeIpcMain();
  registerResumeDraftIpc(ipc as never, async () => ({
    resumeDrafts: drafts,
    resumeDraftEditing: editing,
    resumes: {
      publishNew: async (payload: Record<string, unknown>) => {
        published.push(payload);
        if (publicationGate) {
          publicationStarted?.();
          await publicationGate;
          publicationGate = undefined;
        }
        return {};
      },
      publishExisting: async (payload: Record<string, unknown>) => {
        published.push(payload);
        if (publicationGate) {
          publicationStarted?.();
          await publicationGate;
          publicationGate = undefined;
        }
        return {};
      },
    },
    resumePdfExports: {
      exportPdf: async (payload: Record<string, unknown>) => {
        exported.push(payload);
        return pdfExports.exportPdf(payload as never);
      },
    },
  } as never));

  try {
    const preview = await ipc.invoke<Record<string, unknown>>("resume-drafts:get", ARTIFACT_ID);
    const previewManifest = preview.deliveryManifest as Record<string, unknown>;
    assert.equal(previewManifest.consumer, "preview");
    let saveWithoutManifestError: unknown;
    try {
      await ipc.invoke("resume-drafts:save", {
        artifactId: ARTIFACT_ID,
        expectedRevision: ready.revision,
      });
    } catch (error) {
      saveWithoutManifestError = error;
    }
    let pdfWithoutManifestError: unknown;
    try {
      await ipc.invoke("resume-drafts:export-pdf", {
        artifactId: ARTIFACT_ID,
        expectedRevision: ready.revision,
      });
    } catch (error) {
      pdfWithoutManifestError = error;
    }
    assert.match(
      String(saveWithoutManifestError),
      /preview delivery manifest/iu,
    );
    assert.match(
      String(pdfWithoutManifestError),
      /preview delivery manifest/iu,
    );
    assert.equal(published.length, 0);
    assert.equal(exported.length, 0);


    await repository.save({
      ...draft,
      workspace: {
        ...ready,
        compileResult: {
          ...ready.compileResult,
          usageRatio: ready.compileResult.usageRatio - 0.01,
        },
      },
    });
    await assert.rejects(
      ipc.invoke("resume-drafts:save", {
        artifactId: ARTIFACT_ID,
        expectedRevision: ready.revision,
        deliveryManifest: previewManifest,
      }),
      /current|stale|changed/iu,
    );
    await repository.save(draft);

    await ipc.invoke("resume-drafts:save", {
      artifactId: ARTIFACT_ID,
      expectedRevision: ready.revision,
      deliveryManifest: previewManifest,
    });
    const saveManifest = published[0]?.deliveryManifest as Record<string, unknown>;
    assert.equal(saveManifest.consumer, "save");
    const bulletId = ready.structure.sections
      .flatMap((section) => section.items)
      .flatMap((item) => item.bullets)[0]?.id;
    assert.ok(bulletId);
    let releasePublication: () => void = () => undefined;
    const started = new Promise<void>((resolve) => { publicationStarted = resolve; });
    publicationGate = new Promise<void>((resolve) => { releasePublication = resolve; });
    const pendingSave = ipc.invoke("resume-drafts:save", {
      artifactId: ARTIFACT_ID,
      expectedRevision: ready.revision,
      deliveryManifest: previewManifest,
    });
    await started;
    await assert.rejects(
      ipc.invoke("resume-drafts:edit", {
        artifactId: ARTIFACT_ID,
        target: { type: "bullet", bulletId },
        text: ready.structure.sections
          .flatMap((section) => section.items)
          .flatMap((item) => item.bullets)[0]!.text,
      }),
      /processing|操作/iu,
    );
    releasePublication();
    await pendingSave;

    await repository.save({
      ...draft,
      workspace: {
        ...ready,
        compileResult: {
          ...ready.compileResult,
          bullets: ready.compileResult.bullets.map((bullet, index) =>
            index === 0 ? { ...bullet, lastLineRatio: bullet.lastLineRatio - 0.01 } : bullet,
          ),
        },
      },
    });
    await assert.rejects(
      ipc.invoke("resume-drafts:export-pdf", {
        artifactId: ARTIFACT_ID,
        expectedRevision: ready.revision,
        deliveryManifest: previewManifest,
      }),
      /current|stale|changed/iu,
    );
    await repository.save(draft);
    const pdfResult = await ipc.invoke<{ status: string }>("resume-drafts:export-pdf", {
      artifactId: ARTIFACT_ID,
      expectedRevision: ready.revision,
      deliveryManifest: previewManifest,
    });
    const pdfManifest = exported[0]?.deliveryManifest as Record<string, unknown>;
    assert.equal(pdfManifest.consumer, "pdf");
    assert.equal(sameRevisionDelivery(previewManifest as never, saveManifest as never), true);
    assert.equal(sameRevisionDelivery(previewManifest as never, pdfManifest as never), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("product PDF export accepts timestamp drift but rejects changed mechanics", async () => {
  const { ready } = await createReadySaveFixture();
  const root = await mkdtemp(join(tmpdir(), "coolto-res-runtime-pdf-"));
  const draft = createLocalResumeDraft({
    ownerId: OWNER_ID,
    conversationId: "00000000-0000-4000-8000-000000000003",
    artifactId: ARTIFACT_ID,
    workspace: ready,
  });
  const manifest = createRevisionDeliveryManifest(ready, "pdf");
  const payload = {
    ...buildDraftPdfExportPayload({ draft, expectedRevision: ready.revision }),
    deliveryManifest: manifest,
  };
  const serviceFor = (compileResult: typeof ready.compileResult) =>
    new ResumePdfExportService(
      {
        compile: async () => compileResult,
        compileForPdf: async () => ({
          result: compileResult,
          pdf: Buffer.from("changed"),
        }),
      },
      { choosePath: async () => join(root, "changed.pdf") },
      {
        verifyIntegrity: async () => ({
          valid: true,
          pageCount: 1,
          widthPoints: 595.28,
          heightPoints: 841.89,
          isA4Portrait: true,
          hasTextLayer: true,
          extractedText: "changed",
          embeddedFontNames: ["SimSun", "TimesNewRoman"],
          missingFontNames: [],
          cjkFontNames: ["SimSun"],
          latinFontNames: ["TimesNewRoman"],
          hasTimesNewRoman: true,
          hasSimSun: true,
          violations: [],
        }),
        writer: { write: async () => undefined },
      },
    );

  try {
    await assert.doesNotReject(
      serviceFor({
        ...ready.compileResult,
        observedAt: "2026-09-08T01:00:00.000Z",
      }).exportPdf(payload),
    );
    await assert.rejects(
      serviceFor({
        ...ready.compileResult,
        observedAt: "2026-09-08T02:00:00.000Z",
        usageRatio: ready.compileResult.usageRatio - 0.01,
      }).exportPdf(payload),
      /current|stale|changed|compile/iu,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restart reads the persisted draft through the repository and restorer", async () => {
  const { ready } = await createReadySaveFixture();
  const root = await mkdtemp(join(tmpdir(), "coolto-res-runtime-restart-"));
  const draft = createLocalResumeDraft({
    ownerId: OWNER_ID,
    conversationId: "00000000-0000-4000-8000-000000000004",
    artifactId: ARTIFACT_ID,
    workspace: ready,
  });
  try {
    const first = new ResumeDraftFileRepository(OWNER_ID, root, codec);
    await first.save(draft);
    const restarted = new ResumeDraftFileRepository(OWNER_ID, root, codec);
    const restored = await restarted.get(ARTIFACT_ID);
    assert.equal(restored.workspace.revision, ready.revision);
    assert.equal(restored.workspace.sourceSnapshot.sourceFingerprint, ready.sourceSnapshot.sourceFingerprint);
    await assertResumeWorkspaceCurrent(
      restored.workspace,
      { get: (artifactId) => restarted.get(artifactId) },
      { sourceBuilder: createWorkspaceSnapshotBuilder() },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("repository rejects stale writes after a newer revision is persisted", async () => {
  const { ready } = await createReadySaveFixture();
  const root = await mkdtemp(join(tmpdir(), "coolto-res-runtime-repository-"));
  const draft = createLocalResumeDraft({
    ownerId: OWNER_ID,
    conversationId: "00000000-0000-4000-8000-000000000005",
    artifactId: ARTIFACT_ID,
    workspace: ready,
  });
  try {
    const first = new ResumeDraftFileRepository(OWNER_ID, root, codec);
    const second = new ResumeDraftFileRepository(OWNER_ID, root, codec);
    await first.save(draft);
    const revision = ready.revision + 1;
    const newer = {
      ...draft,
      workspace: {
        ...ready,
        revision,
        compileObservedRevision: revision,
        bestSnapshot: { ...ready.bestSnapshot, revision },
      },
    };
    await second.save(newer);
    await assert.rejects(
      first.save(draft),
      /newer|stale|revision|较新的|覆盖/iu,
    );
    assert.equal((await second.get(ARTIFACT_ID)).workspace.revision, revision);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("repository operation boundary serializes concurrent artifact producers", async () => {
  const root = await mkdtemp(join(tmpdir(), "coolto-res-runtime-operation-lock-"));
  const repository = new ResumeDraftFileRepository(OWNER_ID, root, codec);
  let active = 0;
  let maximum = 0;
  let first = true;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const run = () => repository.withArtifactOperationLock(ARTIFACT_ID, async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    if (first) {
      first = false;
      entered.resolve();
      await release.promise;
    }
    active -= 1;
  });
  try {
    const firstRun = run();
    await entered.promise;
    let secondEntered = false;
    const secondRun = repository.withArtifactOperationLock(ARTIFACT_ID, async () => {
      secondEntered = true;
      active += 1;
      maximum = Math.max(maximum, active);
      active -= 1;
    });
    assert.equal(secondEntered, false);
    release.resolve();
    await Promise.all([firstRun, secondRun]);
    assert.equal(maximum, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace and cloud producers preserve both changes under one boundary", async () => {
  const { ready } = await createReadySaveFixture();
  const root = await mkdtemp(join(tmpdir(), "coolto-res-runtime-producers-"));
  const repository = new ResumeDraftFileRepository(OWNER_ID, root, codec);
  const draft = createLocalResumeDraft({
    ownerId: OWNER_ID,
    conversationId: "00000000-0000-4000-8000-000000000006",
    artifactId: ARTIFACT_ID,
    workspace: ready,
  });
  await repository.save(draft);
  const drafts = new ResumeDraftService(OWNER_ID, repository);
  const linker = new ResumeDraftCloudLinker(repository);
  const originalList = repository.list.bind(repository);
  const listRead = Promise.withResolvers<void>();
  const listRelease = Promise.withResolvers<void>();
  repository.list = async () => {
    const records = await originalList();
    listRead.resolve();
    await listRelease.promise;
    return records;
  };
  const nextRevision = ready.revision + 1;
  const workspace = {
    ...ready,
    revision: nextRevision,
    compileObservedRevision: nextRevision,
    bestSnapshot: { ...ready.bestSnapshot, revision: nextRevision },
  };
  const events = new AgentRuntimeEvents(
    { isDestroyed: () => false, send: () => undefined } as never,
    { addResumeArtifact: async () => undefined } as never,
    drafts,
    new ResumeGenerationTraceStore(),
    { commit: async () => undefined } as never,
  );
  try {
    const cloudLink = linker.link(ready.candidateId, {
      id: "resume-runtime-cloud",
      contentHash: "cloud-content-v1",
      entityVersion: 2,
    } as never);
    await listRead.promise;
    const workspaceSync = events.syncLatestWorkspace(
      "00000000-0000-4000-8000-000000000006",
      {
        workspaceStore: { latest: () => workspace },
        artifactIdByCandidate: new Map([[workspace.candidateId, ARTIFACT_ID]]),
      } as never,
    );
    listRelease.resolve();
    await Promise.all([cloudLink, workspaceSync]);
    const current = await repository.get(ARTIFACT_ID);
    assert.equal(current.workspace.revision, nextRevision);
    assert.equal(current.cloudLink?.resumeId, "resume-runtime-cloud");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("IPC save waits for the cloud-link producer operation lock", async () => {
  const { ready } = await createReadySaveFixture();
  const root = await mkdtemp(join(tmpdir(), "coolto-res-runtime-ipc-cloud-"));
  const repository = new ResumeDraftFileRepository(OWNER_ID, root, codec);
  const draft = createLocalResumeDraft({
    ownerId: OWNER_ID,
    conversationId: "00000000-0000-4000-8000-000000000007",
    artifactId: ARTIFACT_ID,
    workspace: ready,
  });
  await repository.save(draft);
  const drafts = new ResumeDraftService(OWNER_ID, repository);
  const editing = new ResumeDraftEditingService(
    drafts,
    new ResumeManualEditor(new FixturePdfCompiler()),
  );
  const linker = new ResumeDraftCloudLinker(repository);
  const publicationLinker = new ResumeDraftCloudLinker(
    new ResumeDraftFileRepository(OWNER_ID, root, codec),
  );
  const published: Array<Record<string, unknown>> = [];
  const ipc = new FakeIpcMain();
  registerResumeDraftIpc(ipc as never, async () => ({
    resumeDrafts: drafts,
    resumeDraftEditing: editing,
    resumes: {
      publishNew: async (payload: Record<string, unknown>) => {
        await publicationLinker.link(ready.candidateId, {
          id: "resume-runtime-cloud-race",
          contentHash: "cloud-race-content",
          entityVersion: 3,
        } as never);
        published.push(payload);
        return {};
      },
      publishExisting: async (payload: Record<string, unknown>) => {
        await publicationLinker.link(ready.candidateId, {
          id: "resume-runtime-cloud-race",
          contentHash: "cloud-race-content",
          entityVersion: 3,
        } as never);
        published.push(payload);
        return {};
      },
    },
    resumePdfExports: { exportPdf: async () => ({ status: "cancelled" }) },
  } as never));

  const originalList = repository.list.bind(repository);
  const listRead = Promise.withResolvers<void>();
  const listRelease = Promise.withResolvers<void>();
  repository.list = async () => {
    const records = await originalList();
    listRead.resolve();
    await listRelease.promise;
    return records;
  };
  let link: Promise<void> | undefined;
  let save: Promise<unknown> | undefined;
  try {
    const preview = await ipc.invoke<Record<string, unknown>>(
      "resume-drafts:get",
      ARTIFACT_ID,
    );
    const previewManifest = preview.deliveryManifest;
    let ipcRead = false;
    const originalDraftGet = drafts.get.bind(drafts);
    drafts.get = async (artifactId: string) => {
      ipcRead = true;
      return originalDraftGet(artifactId);
    };
    link = linker.link(ready.candidateId, {
      id: "resume-runtime-cloud-race",
      contentHash: "cloud-race-content",
      entityVersion: 3,
    } as never);
    await listRead.promise;
    save = ipc.invoke("resume-drafts:save", {
      artifactId: ARTIFACT_ID,
      expectedRevision: ready.revision,
      deliveryManifest: previewManifest,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(ipcRead, false);
    assert.equal(published.length, 0);
    listRelease.resolve();
    await Promise.allSettled(
      [link, save].filter((value): value is Promise<unknown> => value !== undefined),
    );
    const current = await repository.get(ARTIFACT_ID);
    assert.equal(current.cloudLink?.resumeId, "resume-runtime-cloud-race");
    assert.equal(published.length, 1);
  } finally {
    listRelease.resolve();
    await Promise.allSettled(
      [link, save].filter((value): value is Promise<unknown> => value !== undefined),
    );
    await rm(root, { recursive: true, force: true });
  }
});

test("IPC edit waits for the workspace producer operation lock", async () => {
  const { ready } = await createReadySaveFixture();
  const root = await mkdtemp(join(tmpdir(), "coolto-res-runtime-ipc-workspace-"));
  const repository = new ResumeDraftFileRepository(OWNER_ID, root, codec);
  const draft = createLocalResumeDraft({
    ownerId: OWNER_ID,
    conversationId: "00000000-0000-4000-8000-000000000008",
    artifactId: ARTIFACT_ID,
    workspace: ready,
  });
  await repository.save(draft);
  const drafts = new ResumeDraftService(OWNER_ID, repository);
  const editing = new ResumeDraftEditingService(
    drafts,
    new ResumeManualEditor(new FixturePdfCompiler()),
  );
  const ipc = new FakeIpcMain();
  registerResumeDraftIpc(ipc as never, async () => ({
    resumeDrafts: drafts,
    resumeDraftEditing: editing,
    resumes: {
      publishNew: async () => ({}),
      publishExisting: async () => ({}),
    },
    resumePdfExports: { exportPdf: async () => ({ status: "cancelled" }) },
  } as never));
  const events = new AgentRuntimeEvents(
    { isDestroyed: () => false, send: () => undefined } as never,
    { addResumeArtifact: async () => undefined } as never,
    drafts,
    new ResumeGenerationTraceStore(),
    { commit: async () => undefined } as never,
  );
  const originalGet = repository.get.bind(repository);
  const producerRead = Promise.withResolvers<void>();
  const producerRelease = Promise.withResolvers<void>();
  let firstRead = true;
  let ipcRead = false;
  repository.get = async (artifactId: string) => {
    const current = await originalGet(artifactId);
    if (firstRead) {
      firstRead = false;
      producerRead.resolve();
      await producerRelease.promise;
    } else {
      ipcRead = true;
    }
    return current;
  };
  const nextRevision = ready.revision + 1;
  const workspace = {
    ...ready,
    revision: nextRevision,
    compileObservedRevision: nextRevision,
    bestSnapshot: { ...ready.bestSnapshot, revision: nextRevision },
  };
  const bullet = ready.structure.sections
    .flatMap((section) => section.items)
    .flatMap((item) => item.bullets)[0];
  assert.ok(bullet);
  try {
    const producer = events.syncLatestWorkspace(
      "00000000-0000-4000-8000-000000000008",
      {
        workspaceStore: { latest: () => workspace },
        artifactIdByCandidate: new Map([[workspace.candidateId, ARTIFACT_ID]]),
      } as never,
    );
    await producerRead.promise;
    const edit = ipc.invoke("resume-drafts:edit", {
      artifactId: ARTIFACT_ID,
      target: { type: "bullet", bulletId: bullet.id },
      text: `${bullet.text} manual`,
      createCheckpoint: false,
    });
    await Promise.resolve();
    assert.equal(ipcRead, false);
    producerRelease.resolve();
    await Promise.all([producer, edit]);
    const current = await repository.get(ARTIFACT_ID);
    assert.equal(current.workspace.revision, nextRevision + 1);
    assert.match(
      current.workspace.structure.sections
        .flatMap((section) => section.items)
        .flatMap((item) => item.bullets)
        .find((item) => item.id === bullet.id)?.text ?? "",
      /manual/u,
    );
  } finally {
    producerRelease.resolve();
    await rm(root, { recursive: true, force: true });
  }
});
