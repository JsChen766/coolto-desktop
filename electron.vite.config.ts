import { resolve } from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve("src/desktop/main/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: {
          index: resolve("src/desktop/preload/index.ts"),
          resume: resolve("src/desktop/resume-preload/index.ts"),
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
      rollupOptions: {
        input: {
          index: resolve("src/desktop/renderer/index.html"),
          resume: resolve("src/desktop/renderer/resume.html"),
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
