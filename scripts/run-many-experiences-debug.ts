/**
 * Debug harness: reproduces the desktop resume-generation loop headlessly with
 * the REAL model and MANY experiences, to observe loop behavior end-to-end.
 * Mirrors one pi-agent-core prompt with a realistic px-geometry compiler.
 * Usage: node --import tsx scripts/run-many-experiences-debug.ts
 */
import { performance } from "node:perf_hooks";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import { createConfiguredModelDependencies } from "../src/agent/create-configured-dependencies.js";
import { CooltoApiClient } from "../src/api/coolto-api-client.js";
import { KeychainSessionStore } from "../src/auth/keychain-session-store.js";
import { ensureAuthenticated } from "../src/auth/session-manager.js";
import { loadLocalEnv, readConfig } from "../src/config.js";
import type { ResumeCompiler } from "../src/resume/workspace/compiler-port.js";
import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import type { ResumeStructure } from "../src/resume/types.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createToolRegistry } from "../src/tools/registry.js";
import { createManyExperiencesFixture } from "./support/many-experiences-fixture.js";

class DebugCompiler implements ResumeCompiler {
  public async compile(structure: ResumeStructure): Promise<ResumeCompileResult> {
    const bullets = structure.sections.flatMap((section) =>
      section.items.flatMap((item) => item.bullets),
    );
    const lineHeightPx = 20;
    const availableHeightPx = 1000;
    const charsPerLine = 55;
    let usedPx = 80; // 固定行（标题/分区间距）
    const measurements = bullets.map((bullet) => {
      const length = [...bullet.text].length;
      const lineCount = Math.max(1, Math.ceil(length / charsPerLine));
      usedPx += lineCount * lineHeightPx;
      const lastLineChars = length % charsPerLine || charsPerLine;
      const lastLineRatio = lastLineChars / charsPerLine;
      return {
        bulletId: bullet.id,
        lineCount,
        lastLineWidthPx: Math.round(lastLineRatio * 711),
        availableLineWidthPx: 711,
        lastLineRatio: Number(lastLineRatio.toFixed(3)),
        passed: lastLineRatio >= 0.7,
      };
    });
    const usageRatio = Number((usedPx / availableHeightPx).toFixed(4));
    const violations: ResumeCompileResult["violations"] = [];
    if (usageRatio < 0.92) {
      violations.push({ code: "page_underfilled", message: "Page is underfilled." });
    }
    if (usageRatio > 1) {
      violations.push({ code: "page_overflow", message: "Page overflowed." });
    }
    for (const measurement of measurements) {
      if (!measurement.passed) {
        violations.push({
          code: "bullet_tail_too_short",
          message: "Bullet tail is too short.",
          bulletId: measurement.bulletId,
        });
      }
    }
    return {
      templateId: "resume-standard",
      profileVersion: "debug",
      profileHash: "sha256:debug",
      qualified: violations.length === 0,
      fontsReady: true,
      loadedFontFamilies: ["SimSun"],
      observedAt: "2026-08-17T00:00:00.000Z",
      viewport: { widthPx: 1280, heightPx: 900, devicePixelRatio: 1 },
      pageCount: usageRatio > 1 ? 2 : 1,
      overflowPx: usageRatio > 1 ? 20 : 0,
      usedHeightPx: usedPx,
      availableHeightPx,
      bodyLineHeightPx: lineHeightPx,
      bodyFontSizePx: 13,
      usageRatio,
      effectiveTargetBand: { minimum: 0.92, target: 0.95, maximum: 1 },
      bullets: measurements,
      violations,
    };
  }
}

loadLocalEnv();
const config = readConfig();
const apiClient = new CooltoApiClient({ baseUrl: config.apiBaseUrl });
const sessionStore = new KeychainSessionStore({ apiBaseUrl: config.apiBaseUrl });
await ensureAuthenticated(
  apiClient,
  sessionStore,
  config.apiBaseUrl,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (() => { throw new Error("interactive login unavailable in debug harness"); }) as any,
);

const compiler = new DebugCompiler();
const store = new ResumeWorkspaceStore();
const { readers, builder } = createManyExperiencesFixture();

const modelDependencies = createConfiguredModelDependencies(
  config,
  () => apiClient.getSessionToken(),
);
const agent = createCooltoAgent(
  {
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    modelId: config.modelId,
    tools: createToolRegistry({
      currentUserReader: readers.currentUser,
      userProfileReader: readers.profile,
      jdReader: readers.jd,
      experienceReader: readers.experience,
      agentOrchestrated: { snapshotBuilder: builder, compiler, store },
    }),
  },
  modelDependencies,
);

const startedAt = performance.now();
const PROMPT =
  "请重新为当前战略发展部实习生岗位生成一份针对性简历，使用经历仓库中合适的经历。";
console.log(`[debug] model=${config.modelId} prompt=${PROMPT}`);
try {
  await agent.prompt(PROMPT);
} catch (error: unknown) {
  console.log(`[debug] initial prompt error: ${error instanceof Error ? error.message : String(error)}`);
}
await new Promise((resolve) => setTimeout(resolve, 500));
console.log(`[debug] initial turn done in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);

const workspace = store.latest();
const messages = agent.getMessages();
const lastAssistant = [...messages]
  .reverse()
  .find((message) => message.role === "assistant");
const lastText = lastAssistant
  ?.content.flatMap((part) => (part.type === "text" ? [part.text] : []))
  .join("")
  .slice(0, 500) ?? "";
const toolCalls = messages.filter((message) => message.role === "assistant")
  .flatMap((message) =>
    message.content.flatMap((part) => part.type === "toolCall" ? [part.name] : []),
  );
const status = workspace?.status ?? "no-workspace";
const usage = messages.reduce(
  (total, message) =>
    total +
    (message.role === "assistant" && "usage" in message
      ? Number((message as { usage: Record<string, number> }).usage.input ?? 0)
      : 0),
  0,
);
console.log(`\n[result] status=${status}`);
console.log(`[result] revision=${workspace?.revision ?? 0} bindings=${workspace?.bindings.length ?? 0}`);
console.log(`[result] usageRatio=${workspace ? (workspace.compileResult.usageRatio * 100).toFixed(1) + "%" : "n/a"}`);
if (workspace) {
  const order = workspace.structure.sections.flatMap((section) =>
    section.items.map(
      (item) =>
        `${item.id}(start=${workspace.sourceSnapshot.experiences.find((e) => e.id === item.source_experience_id)?.startDate ?? "?"},${item.bullets.length}条)`,
    ),
  );
  console.log(`[result] itemOrder=${order.join(" → ")}`);
}
console.log(`[result] toolCalls=${toolCalls.join(",")}`);
console.log(`[result] duration=${((performance.now() - startedAt) / 1000).toFixed(1)}s inputTokens≈${usage}`);
console.log(`[result] finalResponse=${lastText.replace(/\n+/gu, " ").slice(0, 400)}`);
