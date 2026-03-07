import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: [".next/", "node_modules/", "scripts/", "public/sw.js", "*.config.js", "*.config.mjs", "*.config.ts"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        URL: "readonly",
        Blob: "readonly",
        crypto: "readonly",
        ResizeObserver: "readonly",
        MessageEvent: "readonly",
        Worker: "readonly",
        indexedDB: "readonly",
        localStorage: "readonly",
        matchMedia: "readonly",
      },
    },
  },
];
