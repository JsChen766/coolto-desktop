import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const nativeCorePath = resolve(
  "native/coolto-core/artifacts",
  process.platform === "win32"
    ? "coolto-core.win32-x64-msvc.node"
    : "coolto-core.darwin-universal.node",
);
const nativeCoreSha256 = existsSync(nativeCorePath)
  ? createHash("sha256").update(readFileSync(nativeCorePath)).digest("hex")
  : "";
const systemPromptSource = readFileSync(
  resolve("src/agent/system-prompt.ts"),
  "utf8",
);
const protectedSystemPrompt = systemPromptSource.match(
  /export const COOLTO_SYSTEM_PROMPT = `([\s\S]*?)`\.trim\(\);/u,
)?.[1];
if (!protectedSystemPrompt) {
  throw new Error("Unable to locate the protected Coolto system prompt");
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __COOLTO_NATIVE_CORE_SHA256__: JSON.stringify(nativeCoreSha256),
    },
    build: {
      bytecode: {
        protectedStrings: [protectedSystemPrompt],
      },
      minify: "esbuild",
      sourcemap: false,
      lib: {
        entry: resolve("src/desktop/main/index.ts"),
      },
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      minify: "esbuild",
      sourcemap: false,
      lib: {
        entry: {
          index: resolve("src/desktop/preload/index.ts"),
          resume: resolve("src/desktop/resume-preload/index.ts"),
          "browser-shell": resolve(
            "src/desktop/browser-shell-preload/index.ts",
          ),
        },
      },
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve("src/desktop/renderer"),
    plugins: [vue()],
    build: {
      minify: "esbuild",
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve("src/desktop/renderer/index.html"),
          resume: resolve("src/desktop/renderer/resume.html"),
          "browser-shell": resolve(
            "src/desktop/renderer/browser-shell.html",
          ),
        },
      },
    },
    resolve: {
      alias: {
        "@": resolve("src/desktop/renderer"),
        "@desktop": resolve("src/desktop/shared"),
      },
    },
  },
});
