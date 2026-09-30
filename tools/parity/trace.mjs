/**
 * Trace a raw RGBA image with the repo's checked-in WASM engine.
 * Usage: node trace.mjs <rgba_path> <size_path> <settings_json> <out_json_path> [orig_rgba_path]
 * The .rgba file is raw bytes, .size contains "W H". When the optional 5th
 * arg (pre-prep original RGBA) is present, the color path re-picks each
 * cluster's fill from the original colors at its member pixels.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  initSync,
  trace_rgba_to_json,
  trace_rgba_to_json_with_originals,
} from "/home/hatch/workspace/rasta-a-svg/public/vendor/vtracer/vtracer_wasm.js";

const wasmPath =
  "/home/hatch/workspace/rasta-a-svg/public/vendor/vtracer/vtracer_wasm_bg.wasm";

const [rgbaPath, sizePath, settingsJson, outPath, origRgbaPath] =
  process.argv.slice(2);

const raw = readFileSync(wasmPath);
const wasmCopy = new Uint8Array(raw.length);
wasmCopy.set(raw);
initSync({ module: wasmCopy.buffer });

const [w, h] = readFileSync(sizePath, "utf8").trim().split(" ").map(Number);
const pixels = new Uint8Array(readFileSync(rgbaPath));
const out =
  origRgbaPath != null
    ? trace_rgba_to_json_with_originals(
        w,
        h,
        pixels,
        new Uint8Array(readFileSync(origRgbaPath)),
        settingsJson,
      )
    : trace_rgba_to_json(w, h, pixels, settingsJson);
writeFileSync(outPath, out);
const parsed = JSON.parse(out);
console.log(
  `traced ${w}x${h}: ${parsed.layers.length} layers, svg ${parsed.svg.length} bytes`,
);
