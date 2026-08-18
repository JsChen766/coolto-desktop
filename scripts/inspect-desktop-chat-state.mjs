#!/usr/bin/env node

import { setTimeout as sleep } from "node:timers/promises";

const stopRequested = process.argv.includes("--stop");
const cdpBase = process.argv.find((value) => /^https?:\/\//u.test(value)) ??
  "http://127.0.0.1:9222";
const page = await findPage(cdpBase, 10_000);
const session = await connect(page.webSocketDebuggerUrl);

try {
  await session.send("Runtime.enable");
  if (stopRequested) {
    await evaluate(session, `(() => {
      const button = document.querySelector('[data-testid="chat-composer-stop"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
  }
  const state = await evaluate(session, `(() => {
    const messages = [...document.querySelectorAll('[data-testid="chat-message"]')];
    const resume = document.querySelector('[data-testid="resume-active-draft-status"]') ??
      [...document.querySelectorAll('[data-testid="resume-draft-status"]')].at(-1);
    return {
      stopRequested: ${stopRequested},
      running: Boolean(document.querySelector('[data-testid="chat-composer-stop"]')),
      composerDisabled: Boolean(document.querySelector('[data-testid="chat-composer-input"]')?.disabled),
      userCount: messages.filter((item) => item.dataset.messageRole === "user").length,
      assistantCount: messages.filter((item) => item.dataset.messageRole === "assistant").length,
      runError: document.querySelector('[data-testid="chat-run-error"]')?.textContent?.trim() ?? "",
      approvalActionType: document.querySelector('[data-testid="approval-card"]')?.dataset.approvalActionType ?? "",
      tools: [...document.querySelectorAll('[data-testid="tool-run"]')].map((item) => ({
        callId: item.dataset.toolCallId ?? "",
        name: item.dataset.toolName ?? "",
        status: item.dataset.toolStatus ?? "",
        error: item.dataset.toolError ?? "",
        text: item.textContent?.trim() ?? "",
      })),
      resume: {
        artifactId: resume?.dataset.artifactId ?? "",
        revision: Number(resume?.dataset.revision ?? 0),
        workspaceStatus: resume?.dataset.workspaceStatus ?? "",
        generationReady: resume?.dataset.generationReady === "true",
        pageCount: Number(resume?.dataset.pageCount ?? 0),
        usageRatio: Number(resume?.dataset.pageUsageRatio ?? 0),
        blockerCodes: (resume?.dataset.blockerCodes ?? "").split(",").filter(Boolean),
      },
    };
  })()`);
  if (state.resume.artifactId) {
    state.draft = await evaluate(session, `(async () => {
      const draft = await window.coolto.resumeDrafts.get(${JSON.stringify(state.resume.artifactId)});
      const measurements = new Map(
        draft.compileResult.bullets.map((bullet) => [bullet.bulletId, bullet]),
      );
      return {
        revision: draft.revision,
        items: draft.structure.sections.flatMap((section) =>
          section.items.map((item) => ({
            itemId: item.id,
            title: item.title,
            bullets: item.bullets.map((bullet) => ({
              bulletId: bullet.id,
              text: bullet.text,
              lineCount: measurements.get(bullet.id)?.lineCount ?? 0,
              lastLineRatio: measurements.get(bullet.id)?.lastLineRatio ?? 0,
            })),
          })),
        ),
      };
    })()`);
  }
  process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
} finally {
  session.close();
}

async function findPage(base, waitMs) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/json`);
      const targets = await response.json();
      const pageTarget = targets.find((target) =>
        target.type === "page" && target.webSocketDebuggerUrl &&
        target.title === "Coolto" && /\/renderer\/index\.html$/u.test(target.url ?? ""));
      if (pageTarget) return pageTarget;
    } catch {
      // App may still be booting.
    }
    await sleep(250);
  }
  throw new Error(`No Coolto CDP page target at ${base} within ${waitMs}ms`);
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
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
      const response = await new Promise((resolve) => {
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      });
      if (response.error) throw new Error(`${method}: ${response.error.message}`);
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
    throw new Error(result.exceptionDetails.exception?.description ?? "CDP evaluation failed");
  }
  return result.result?.value;
}
