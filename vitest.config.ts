import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Tests don't need static assets, and serving public/ as assets can cause
  // the WASM glue import to resolve without its named exports on a cold
  // first run (Claude review: "initSync is not a function" flake).
  publicDir: false,
  test: {
    environment: "node"
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname)
    }
  }
});
