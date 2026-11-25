import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2020",
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        icecream: resolve(import.meta.dirname, "icecream/index.html"),
        archive: resolve(import.meta.dirname, "archive/index.html"),
        pluck: resolve(import.meta.dirname, "pluck/index.html"),
      },
    },
  },
});
