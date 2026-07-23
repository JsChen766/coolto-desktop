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
        entry: resolve("src/desktop/preload/index.ts"),
      },
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve("src/desktop/renderer"),
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: resolve("src/desktop/renderer/index.html"),
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
