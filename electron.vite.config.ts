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

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ["@earendil-works/pi-ai", "@earendil-works/pi-agent-core"],
      }),
    ],
    define: {
      __COOLTO_NATIVE_CORE_SHA256__: JSON.stringify(nativeCoreSha256),
    },
    build: {
      minify: "esbuild",
      sourcemap: false,
      lib: {
        entry: resolve("src/desktop/main/index.ts"),
      },
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
          inlineDynamicImports: true,
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
          "browser-agent-inspector": resolve(
            "src/desktop/browser-agent-inspector-preload/index.ts",
          ),
          "browser-download-popover": resolve(
            "src/desktop/browser-download-popover-preload/index.ts",
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
          "browser-agent-inspector": resolve(
            "src/desktop/renderer/browser-agent-inspector.html",
          ),
          "browser-download-popover": resolve(
            "src/desktop/renderer/browser-download-popover.html",
          ),
          ...(process.env.COOLTO_AGENT_TASKS_UI_QA === "1"
            ? {
                "agent-tasks-qa": resolve(
                  "src/desktop/renderer/agent-tasks-qa.html",
                ),
              }
            : {}),
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
