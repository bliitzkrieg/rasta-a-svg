import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // The WASM glue import races between parallel test files on a cold
  // start ("initSync is not a function" in vtracerWasm.test.ts).
  // Serial test files remove the race (Claude review); ~5 s slower.
  publicDir: false,
  test: {
    environment: "node",
    fileParallelism: false
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname)
    }
  }
});
