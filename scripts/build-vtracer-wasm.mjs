import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(rootDir, "rust", "vtracer-wasm", "Cargo.toml");
const targetWasm = resolve(
  rootDir,
  "rust",
  "vtracer-wasm",
  "target",
  "wasm32-unknown-unknown",
  "release",
  "vtracer_wasm.wasm",
);
const outDir = resolve(rootDir, "public", "vendor", "vtracer");

mkdirSync(outDir, { recursive: true });

run("cargo", [
  "build",
  "--manifest-path",
  manifestPath,
  "--release",
  "--target",
  "wasm32-unknown-unknown",
]);

run("wasm-bindgen", [
  targetWasm,
  "--out-dir",
  outDir,
  "--target",
  "web",
  "--no-typescript",
]);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(missingBinaryMessage(command));
    }
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`);
  }
}

function missingBinaryMessage(command) {
  if (command === "cargo") {
    return [
      "Rust tooling is required to rebuild the client-side VTracer bundle.",
      "Install Rust from https://rustup.rs and add the wasm target with:",
      "rustup target add wasm32-unknown-unknown",
    ].join("\n");
  }

  return [
    "wasm-bindgen-cli is required to rebuild the client-side VTracer bundle.",
    "Install it with:",
    "cargo install wasm-bindgen-cli",
  ].join("\n");
}
