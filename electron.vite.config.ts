import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

// main/preload: plain TS bundled for Node/Electron. `pg` (and any other
// node_modules dep) stays a real runtime dependency rather than getting
// bundled in — externalizeDepsPlugin() does that.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
        output: { format: "cjs" },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        output: { format: "cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
  },
});
