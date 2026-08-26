#!/usr/bin/env node
/**
 * Drive a running packaged Coolto window through opt-in Chrome DevTools Protocol.
 *
 * Start the app explicitly with CDP enabled, then run:
 *   Coolto.exe --remote-debugging-port=9222
 *   npm run smoke:desktop-chat -- --new-chat --message "回复 OK"
 *   npm run smoke:desktop-chat -- --message "读取附件" --file C:\\tmp\\resume.pdf
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  desktopChatUsage,
  parseDesktopChatArgs,
} from "./support/desktop-chat-options.mjs";

let options = {};
let cdpBase = process.env.COOLTO_SMOKE_CDP ?? "http://127.0.0.1:9222";
let timeoutMs = Number(process.env.COOLTO_SMOKE_TIMEOUT_MS ?? 600_000);
let session;
const CDP_REQUEST_TIMEOUT_MS = 5_000;

try {
  options = parseDesktopChatArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${desktopChatUsage()}\n`);
    process.exit(0);
  }
  if (!options.message) fail(desktopChatUsage());
  cdpBase = options.cdp ?? cdpBase;
  timeoutMs = options.timeout ?? timeoutMs;
  const page = await findPage(cdpBase, Math.min(timeoutMs, 60_000));
  session = await connect(page.webSocketDebuggerUrl);
  await session.send("Runtime.enable");
  if (options.newChat) await startNewChat(session);
  await waitForComposer(session, Math.min(timeoutMs, 60_000));

  if (options.file) {
    const file = resolve(options.file);
    await access(file);
    await setFileInput(session, file);
    await waitForAttachment(session, Math.min(timeoutMs, 60_000));
  }

  const baseline = await readState(session);
  await installAgentObservation(session);
  const startedAt = Date.now();
  await submitMessage(session, options.message);
  const result = await waitForResult(
    session,
    baseline,
    timeoutMs,
    Boolean(options.requireResumeReady),
    Boolean(options.acceptResumeAugmentation),
  );
  result.durationMs = Date.now() - startedAt;
  result.agentEvents = await readAgentObservation(session);
  if (options.openResumePreview && result.resume.artifactId) {
    result.preview = await openResumePreview(
      session,
      result.resume.artifactId,
      Math.min(timeoutMs, 30_000),
    );
  }
  if (options.screenshot) {
    result.screenshot = await captureScreenshot(session, options.screenshot);
  }
  result.cdp = cdpBase;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.success) process.exitCode = 1;
} catch (error) {
  const result = {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    cdp: cdpBase,
  };
  if (session && options.screenshot) {
    try {
      result.screenshot = await captureScreenshot(session, options.screenshot);
    } catch {
      /* Preserve the original smoke failure. */
    }
  }
  process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  session?.close();
}

function fail(message) {
  throw new Error(message);
}

async function findPage(base, waitMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/json`);
      const targets = await response.json();
      const page = targets.find((target) =>
        target.type === "page" &&
        target.webSocketDebuggerUrl &&
        target.title === "Coolto" &&
        isCooltoPageUrl(target.url),
      );
      if (page) return page;
    } catch {
      /* App may still be booting. */
    }
    await sleep(500);
  }
  fail(`No Coolto CDP page target at ${base} within ${waitMs}ms`);
}

function isCooltoPageUrl(value) {
  try {
    const url = new URL(value ?? "");
    return /\/renderer\/index\.html$/u.test(url.pathname) ||
      (url.hostname === "localhost" && url.pathname === "/");
  } catch {
    return false;
  }
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    callback(message);
  });
  return {
    async send(method, params = {}) {
      const id = nextId++;
      const response = await new Promise((resolveResponse, rejectResponse) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rejectResponse(new Error(
            `CDP request timed out: ${method} after ${CDP_REQUEST_TIMEOUT_MS}ms`,
          ));
        }, CDP_REQUEST_TIMEOUT_MS);
        pending.set(id, (message) => {
          clearTimeout(timer);
          resolveResponse(message);
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
      if (response.error) fail(`${method}: ${response.error.message}`);
      return response.result ?? {};
    },
    close: () => socket.close(),
  };
}

async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    fail(result.exceptionDetails.exception?.description ?? "CDP evaluation failed");
  }
  return result.result?.value;
}

async function waitForComposer(session, waitMs) {
  await poll(waitMs, async () => {
    const state = await readState(session);
    return state.composerReady ? state : undefined;
  }, "an enabled chat composer");
}

async function startNewChat(session) {
  const clicked = await evaluate(session, `(() => {
    const button = document.querySelector('[data-testid="sidebar-new-chat"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) fail("New chat could not be created");
  await poll(10_000, async () => {
    const state = await readState(session);
    return state.composerReady && state.userCount === 0 && state.assistantCount === 0
      ? state
      : undefined;
  }, "a blank new chat");
}

async function setFileInput(session, file) {
  await session.send("DOM.enable");
  const document = await session.send("DOM.getDocument", { depth: 0 });
  const input = await session.send("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector: '[data-testid="chat-composer-file"]',
  });
  if (!input.nodeId) fail("Chat attachment file input was not found");
  await session.send("DOM.setFileInputFiles", {
    nodeId: input.nodeId,
    files: [file],
  });
  await evaluate(session, `document.querySelector('[data-testid="chat-composer-file"]')?.dispatchEvent(new Event("change", { bubbles: true }))`);
}

async function waitForAttachment(session, waitMs) {
  return poll(waitMs, async () => {
    const state = await readState(session);
    if (state.attachmentError) fail(`Attachment failed: ${state.attachmentError}`);
    return state.attachmentName ? state : undefined;
  }, "the selected attachment");
}

async function submitMessage(session, message) {
  const encoded = JSON.stringify(message);
  const filled = await evaluate(session, `(() => {
    const input = document.querySelector('[data-testid="chat-composer-input"]');
    if (!(input instanceof HTMLTextAreaElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(input, ${encoded});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  if (!filled) fail("Chat message could not be filled");
  await poll(5_000, async () => {
    const state = await readState(session);
    return state.sendReady ? state : undefined;
  }, "the chat send button to become enabled");
  const submitted = await evaluate(session, `(() => {
    const button = document.querySelector('[data-testid="chat-composer-send"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!submitted) fail("Chat message could not be submitted");
}

async function installAgentObservation(session) {
  const installed = await evaluate(session, `(() => {
    window.__cooltoSmokeAgentUnsubscribe?.();
    window.__cooltoSmokeAgentEvents = [];
    window.__cooltoSmokeResumeCallIds = [];
    const agent = window.coolto?.agent;
    if (!agent?.onEvent) return false;
    window.__cooltoSmokeAgentUnsubscribe = agent.onEvent((_conversationId, event) => {
      if (event.type === "tool.started" && event.name === "apply_resume_content") {
        const args = event.arguments && typeof event.arguments === "object"
          ? event.arguments
          : {};
        const rewrites = Array.isArray(args.tailRewrites) ? args.tailRewrites : [];
        const growths = Array.isArray(args.tailGrowths) ? args.tailGrowths : [];
        const reflows = Array.isArray(args.lineRewrites) ? args.lineRewrites : [];
        window.__cooltoSmokeResumeCallIds.push(event.callId);
        window.__cooltoSmokeAgentEvents.push({
          type: event.type,
          callId: event.callId,
          expectedRevision: args.expectedRevision,
          inputMode: ["items", "bulletUpdates", "bulletRemovals",
            "bulletAdditions", "tailRewrites", "tailGrowths", "lineRewrites"]
            .find((key) => Array.isArray(args[key]) && args[key].length),
          targetCount: rewrites.length || growths.length || reflows.length,
          tailRewrites: rewrites.map((entry) => ({
            bulletId: entry?.bulletId ?? "",
            candidates: Array.isArray(entry?.candidates)
              ? entry.candidates.map((candidate) => ({
                  strategy: candidate?.strategy ?? "",
                  revisedText: candidate?.revisedText ?? "",
                }))
              : [],
          })),
          tailGrowths: growths.map((entry) => ({
            bulletId: entry?.bulletId ?? "",
            growthText: entry?.growthText ?? "",
            growthCharacters: [...(entry?.growthText ?? "")].length,
          })),
          tailReflows: reflows.map((entry) => ({
            bulletId: entry?.bulletId ?? "",
            revisedText: entry?.revisedText ?? "",
          })),
        });
      }
      if (
        event.type === "tool.completed" &&
        event.name === "apply_resume_content" &&
        window.__cooltoSmokeResumeCallIds.includes(event.callId)
      ) {
        window.__cooltoSmokeAgentEvents.push({
          type: event.type,
          callId: event.callId,
          isError: event.isError,
          error: event.error ?? "",
          progress: event.progress,
        });
      }
    });
    return true;
  })()`);
  if (!installed) fail("Agent event observation could not be installed");
}

async function readAgentObservation(session) {
  return evaluate(
    session,
    `window.__cooltoSmokeAgentEvents ?? []`,
  );
}

async function waitForResult(
  session,
  baseline,
  waitMs,
  requireResumeReady,
  acceptResumeAugmentation,
) {
  const observedTools = new Map();
  const observedProgress = [];
  const progressSeen = new Set();
  let augmentationAcceptCount = 0;
  let minimumAssistantCount = baseline.assistantCount + 1;
  let started = false;
  const state = await poll(waitMs, async () => {
    const current = await readState(session);
    for (const tool of current.tools) observedTools.set(tool.callId, tool);
    if (current.progressLabel && !progressSeen.has(current.progressLabel)) {
      progressSeen.add(current.progressLabel);
      observedProgress.push(current.progressLabel);
    }
    started ||= current.running || current.userCount > baseline.userCount ||
      current.assistantCount > baseline.assistantCount;
    if (
      acceptResumeAugmentation &&
      !current.running &&
      current.approvalActionType === "resume.augmented.confirm"
    ) {
      if (await acceptResumeApproval(session)) {
        augmentationAcceptCount += 1;
        minimumAssistantCount = current.assistantCount + 1;
      }
      return undefined;
    }
    const readyExperienceSync =
      current.approvalActionType === "resume.experience.sync" &&
      current.resumeWorkspaceStatus === "ready_for_approval" &&
      current.resumeGenerationReady && current.resumePageCount === 1 &&
      current.resumeUsageRatio >= 0.92;
    const finished = started && !current.running && (
      current.assistantCount >= minimumAssistantCount ||
      Boolean(current.runError) || readyExperienceSync
    ) && (!current.approvalActionType || readyExperienceSync);
    return finished ? current : undefined;
  }, "the chat run to complete");
  await settleCompletedTools(session, 2_000);
  const settledState = await readState(session);
  if (settledState.progressLabel && !progressSeen.has(settledState.progressLabel)) {
    observedProgress.push(settledState.progressLabel);
  }
  const tools = [...observedTools.values()];
  for (const tool of settledState.tools) observedTools.set(tool.callId, tool);
  tools.splice(0, tools.length, ...observedTools.values());
  const toolErrors = tools.filter((tool) => tool.status === "error");
  const resumeChanged = Boolean(settledState.resumeArtifactId) && (
    settledState.resumeArtifactId !== baseline.resumeArtifactId ||
    settledState.resumeRevision !== baseline.resumeRevision
  );
  const resumeReady = resumeChanged &&
    settledState.resumeWorkspaceStatus === "ready_for_approval" &&
    settledState.resumeGenerationReady === true &&
    settledState.resumePageCount === 1 &&
    settledState.resumeUsageRatio >= 0.92;
  return {
    success: !settledState.runError && toolErrors.length === 0 &&
      (!requireResumeReady || resumeReady),
    finalResponse: settledState.lastAssistant,
    runError: settledState.runError,
    approvalActionType: settledState.approvalActionType,
    tools,
    toolErrors,
    progressMessages: observedProgress,
    augmentationAcceptCount,
    resume: {
      required: requireResumeReady,
      changed: resumeChanged,
      ready: resumeReady,
      artifactId: settledState.resumeArtifactId,
      revision: settledState.resumeRevision,
      workspaceStatus: settledState.resumeWorkspaceStatus,
      generationReady: settledState.resumeGenerationReady,
      pageCount: settledState.resumePageCount,
      usageRatio: settledState.resumeUsageRatio,
      blockerCodes: settledState.resumeBlockerCodes,
    },
  };
}

async function readState(session) {
  return evaluate(session, `(() => {
    const input = document.querySelector('[data-testid="chat-composer-input"]');
    const messages = [...document.querySelectorAll('[data-testid="chat-message"]')];
    const assistant = messages.filter((item) => item.dataset.messageRole === "assistant");
    const resume = document.querySelector('[data-testid="resume-active-draft-status"]') ??
      [...document.querySelectorAll('[data-testid="resume-draft-status"]')].at(-1);
    return {
      composerReady: input instanceof HTMLTextAreaElement && !input.disabled,
      sendReady: document.querySelector('[data-testid="chat-composer-send"]') instanceof HTMLButtonElement &&
        !document.querySelector('[data-testid="chat-composer-send"]').disabled,
      running: Boolean(document.querySelector('[data-testid="chat-composer-stop"]')),
      userCount: messages.filter((item) => item.dataset.messageRole === "user").length,
      assistantCount: assistant.length,
      lastAssistant: assistant.at(-1)?.textContent?.trim().slice(0, 8000) ?? "",
      runError: document.querySelector('[data-testid="chat-run-error"]')?.textContent?.trim() ?? "",
      progressLabel: document.querySelector('[data-testid="resume-generation-progress"]')?.textContent?.trim() ?? "",
      approvalActionType: document.querySelector('[data-testid="approval-card"]')?.dataset.approvalActionType ?? "",
      attachmentName: document.querySelector('[data-testid="chat-composer-attachment"] .composer-attachment-name')?.textContent?.trim() ?? "",
      attachmentError: document.querySelector('[data-testid="chat-composer-attachment-error"]')?.textContent?.trim() ?? "",
      resumeArtifactId: resume?.dataset.artifactId ?? "",
      resumeRevision: Number(resume?.dataset.revision ?? 0),
      resumeWorkspaceStatus: resume?.dataset.workspaceStatus ?? "",
      resumeGenerationReady: resume?.dataset.generationReady === "true",
      resumePageCount: Number(resume?.dataset.pageCount ?? 0),
      resumeUsageRatio: Number(resume?.dataset.pageUsageRatio ?? 0),
      resumeBlockerCodes: (resume?.dataset.blockerCodes ?? "").split(",").filter(Boolean),
      tools: [...document.querySelectorAll('[data-testid="tool-run"]')].map((item) => ({
        callId: item.dataset.toolCallId ?? "",
        name: item.dataset.toolName ?? "",
        status: item.dataset.toolStatus ?? "",
        error: item.dataset.toolError ?? "",
      })),
    };
  })()`);
}

async function acceptResumeApproval(session) {
  return evaluate(session, `(() => {
    const card = document.querySelector('[data-testid="approval-card"]');
    const button = card?.querySelector('[data-testid="approval-accept"]');
    if (card?.dataset.approvalActionType !== "resume.augmented.confirm" ||
        !(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`);
}

async function openResumePreview(session, artifactId, waitMs) {
  const clicked = await evaluate(session, `(() => {
    const status = document.querySelector('[data-testid="resume-active-draft-status"]');
    if (status?.dataset.artifactId !== ${JSON.stringify(artifactId)}) return false;
    if (document.querySelector('.resume-a4-root')) return true;
    const button = status.querySelector('.preview-toggle');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) fail(`Resume artifact ${artifactId} could not be opened`);
  const preview = await poll(waitMs, () => evaluate(session, `(() => {
    const root = document.querySelector('.resume-a4-root');
    if (!(root instanceof HTMLElement)) return undefined;
    return { text: root.innerText.trim(), scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight };
  })()`), "the resume preview to open");
  return preview;
}

async function settleCompletedTools(session, waitMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const state = await readState(session);
    if (!state.tools.some((tool) => tool.status === "running")) return;
    await sleep(100);
  }
}

async function poll(waitMs, operation, description) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) {
      if (!isCdpTimeout(error)) throw error;
    }
    await sleep(200);
  }
  fail(`Timed out waiting for ${description} after ${waitMs}ms`);
}

function isCdpTimeout(error) {
  return error instanceof Error && error.message.startsWith("CDP request timed out:");
}

async function captureScreenshot(session, path) {
  const output = resolve(path);
  await session.send("Page.enable");
  const result = await session.send("Page.captureScreenshot", { format: "png" });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(result.data, "base64"));
  return output;
}
