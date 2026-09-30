# Pixel-perfect SVG feedback (re-review)

This re-review covers `main` at `f7b0d8a`: all commits since the first feedback (`f7b1a9d` v1.0.34 → `f7b0d8a`, i.e. v1.0.34-v1.0.38 plus the parity-harness commits).

**Summary:** the residual correction layer works. On opaque flat art the output is now **exactly** pixel-perfect: 100% of pixels identical when rendered with a real SVG renderer, over both white and black backgrounds. Four things still keep it from being pixel-perfect in general:

1. **Soft (semi-transparent) edges on the binary path come out wrong, by up to 212 levels.** It's a one-character fix, verified below.
2. **The color path** (photos, shaded art) has no residual layer. It's still about 36% exact.
3. **The committed harness doesn't measure the shipped code.** It mirrors v1.0.33 logic and can't parse the residual layer.
4. **`npm run check` is red** on a clean clone.

---

## How I measured

The harness can't measure the current code (see item 5), so I rendered the real pipeline myself. I called `traceBinaryLayers` / `trace_rgba_to_json_with_originals` from vitest with the checked-in WASM, rendered the SVG with **resvg** (`@resvg/resvg-js`) at 1:1, and compared it with the original composited over the **same** background, both white and black. "Exact" means all three RGB channels are equal. The prep pipeline (median, posterize, and so on) was skipped, so `pixels = originalPixels`. That changes geometry, but not whether the residual layer makes the output exact.

| Input | Path | Over white | Over black | SVG size |
|---|---|---|---|---|
| Synthetic 48×48 anti-aliased disc, opaque | binary + residual | **100.00%** exact | **100.00%** | 17 KB |
| Same, color path | color (no residual) | 36.15%, max err 11 | 36.15% | — |
| Synthetic disc, **soft alpha edge on transparent bg** | binary + residual | 97.40%, **max err 212** | 95.31%, max err 210 | 8.8 KB |
| `example/input/GooseBalloon.png` (4000² → 1000² box-downscale), tier 32 | binary + residual | 99.564%, max err 65 | 99.532%, max err 254 | 10.23 MB |
| `example/input/GooseCupid.png`, same | binary + residual | 99.465%, max err 61 | 99.397%, max err 254 | 21.69 MB |
| **With fix 1 below applied** (soft-alpha disc) | binary + residual | **100.00%** | **100.00%** | 2.6 KB |
| **With fix 1** GooseBalloon | binary + residual | **100.000%** | **100.000%** | **7.16 MB** |
| **With fix 1** GooseCupid | binary + residual | **100.000%** | **100.000%** | **18.74 MB** |

With fix 1, both Goose images are **exactly** pixel-perfect over any background, and the files are **smaller** (-30% and -14%). I applied the patch only locally to measure it and reverted it; nothing in this commit changes code.

---

## Status of the previous items

| # | Item | Status |
|---|---|---|
| 1 | `pt` → px | Done in TS (`binaryLayers.ts`, `svg.ts`) and via `stripPtUnits` in the worker. **Rust `build_svg` still emits `pt`** (`lib.rs:742`), even though v1.0.38 rebuilt the WASM. Fix it there and delete `stripPtUnits`. |
| 2 | 1000 px downscale | Minimum fix only, and **binary path only** (see item 3). Output is exact against the *downscaled* image; at source size it's a 4× upscale. |
| 3.1 | Transparent background painted | Fixed for `alpha == 0`. **Not fixed for `0 < alpha < 255`**, and the residual layer made that case worse. See item 1. |
| 3.2 | Composite over white | Unchanged. It no longer matters on the binary path once item 1 is fixed (fills and residual come from the originals). Still bakes in white on the color path. |
| 3.3 | `flatten_alpha` at 128 | Only the redundant call on the binary path was removed. The color path still thresholds at 128, so 3.3 is **not** addressed. |
| 3.4 | Keying heuristic | Changed, but it's now stricter than before. See item 4. |
| 4 | Harness | Committed, but it doesn't measure the shipped code. See item 5. |
| 5 | Mode fill | Done. |
| 6 | Residual layer | Done for the binary path and verified exact. Color path missing. See item 2. |
| 8 | Decode precision | `premultiplyAlpha: "none"` **doesn't fix it**. See item 6. |

---

## 1. P0: soft-alpha pixels are painted opaque, then tinted by the residual

`paletteRanksOnOriginals` (`lib/vectorize/binaryLayers.ts:112`) only gives rank `-1` to `alpha === 0`. A pixel with `alpha = 40` still gets a rank, so an opaque layer paints it with a full-strength fill. `buildResidualLayer` then compares its **white-composited** color to the fill. When they differ, it paints `fill=<orig rgb> fill-opacity=<a>` **on top of the opaque layer**. The result is `orig·a + layerFill·(1−a)`: blended over the layer color, not over the page.

For a red logo's anti-aliased edge, a nearly transparent fringe pixel renders nearly solid red: error 212 over white, and the pixel is opaque, so it's wrong on every background.

**Fix (verified above):**

```ts
// paletteRanksOnOriginals, binaryLayers.ts:112
if (originalPixels[o + 3] !== 255) {   // was: === 0
  ranks[p] = -1;
  continue;
}
```

No other change is needed. The `r < 0` branch of `buildResidualLayer` already emits exact RGB plus `fill-opacity` for unpainted, non-transparent pixels, and since no layer paints under them, they blend over the page exactly as the PNG does.

Once this lands:
- The `oa === 0 → match = false` branch (`binaryLayers.ts:608`) is unreachable and would emit useless `fill-opacity="0.000"` paths. Delete it.
- The `0 < oa < 255` compare branch below it is also unreachable. Delete it.
- Update the `paletteRanksOnOriginals` test and add a partial-alpha case.

## 2. P1: the color path has no residual layer

The worker only builds a residual layer for `traceBinaryLayers`. Every image where no palette tier fires (photos, shaded illustrations: about half the 18-image suite) goes through `trace_rgba_to_json_with_originals` and ships with one flat fill per cluster, which was 36% exact on the synthetic disc. Also, v1.0.37's `sourceWidth`/`sourceHeight` display size is only wired into the binary path, so color-path SVGs of large images still display at the traced size.

**Fix:**
- In `build_color_output` (`lib.rs`), turn the existing `claimed: Vec<bool>` into `label: Vec<u32>` (paint index per pixel; 4 MB at 1000²).
- Compute the residual in Rust against `originals`, and emit the same row-run rectangle paths as `buildResidualLayer`, using `fill-opacity` for `alpha < 255`.
- Or return the label map plus fills and reuse the TS function.
- Verify that "last-painted cluster whose members include p" matches the real render in stacked mode. The resvg check below will tell you.
- Apply the source display size in the worker to **both** paths. The simplest way is one header rewrite that replaces `width`/`height` on whatever SVG comes back.

## 3. P1: the residual layer silently breaks when filterSpeckle > 1

The prediction `fills[splitRanks[p]]` assumes every mask pixel gets traced. The settings UI lets users set Filter Speckle up to 16 (`SettingsPanel.tsx:71`). The binary tracer then drops clusters smaller than `filterSpeckle²`, so those pixels are painted by a lower layer while the prediction assumes the higher one. The residual misses them, so the output isn't exact anymore.

**Fix:** force `filterSpeckle: 1` in `binaryOptionsJson` inside `traceBinaryLayers`. The residual layer is the accuracy mechanism now, and speckle filtering there only removes pixels the residual would then have to re-add.

## 4. P1: `should_key_image` is now stricter than before

`lib.rs:759` keys only when **20% of all pixels** are fully transparent. The old heuristic needed about 8% of the sampled pixels. A logo with, say, 10% transparent area is now **not** keyed, and its transparent pixels are clustered and painted.

**Fix:** key whenever at least one pixel has `alpha == 0` (threshold `1`). Keying costs nothing when it isn't needed.

## 5. P1: the harness doesn't measure what ships

`tools/parity/parity.py`:
- `score_exact` (`:1284`) is defined but **never called**. `main` only reports the ±24 `score` (`:1814`). The README says `exact_pct`, `mae`, `max_err`, and `psnr` are reported, but they aren't.
- Its Python "mirror" is stale:
  - `_binary_ranks_on_originals` still ranks transparent pixels.
  - `_recolor_binary_fills` still uses the v1.0.26 guard plus the ±24 vote.
  - There's no residual layer.
  - It writes `pt`.

  So it measures v1.0.33, and none of v1.0.34-v1.0.38 has been measured by it.
- `_parse_svg_paths` (`:1111`) only tokenizes uppercase `M C Z L`, and its regex needs `d=` to come right after `fill=`. Residual paths (`h`/`v`/`z`, plus `fill-opacity`) are dropped or mis-parsed, so the harness would score the output as if the residual layer weren't there.
- It renders onto an RGB white canvas (`:1251`) with a custom PIL rasterizer. There's no alpha and no black background.
- `trace.mjs` hard-codes `/home/hatch/workspace/...`, so it can't run from a clone.

**Recommendation:** stop maintaining a Python copy of the TS pipeline, because it will keep drifting. Measure the real code instead:

1. Add `@resvg/resvg-js` and a PNG decoder (`pngjs`) as devDependencies.
2. Add a vitest suite (for example `tests/pixelPerfect.test.ts`) that:
   - loads the checked-in WASM the way `tests/vtracerWasm.test.ts` already does;
   - runs `traceBinaryLayers` and the color path on synthetic fixtures generated in code (no committed images needed): an opaque anti-aliased disc, a disc with a soft alpha edge on a transparent background, a gradient, 1 px lines, and a 2-color checkerboard;
   - renders each SVG with `new Resvg(svg, { background, fitTo: { mode: "width", value: w } })`;
   - asserts **100% exact** over both `"white"` and `"black"`.

   Each image takes about 1 s, which is how the table above was produced.
3. Keep the 18-image suite as an optional, fixture-gated benchmark that reports exact %, max error, and SVG bytes per image.

## 6. P2: `premultiplyAlpha: "none"` doesn't fix decode precision

(My first review suggested this option, and it was the wrong fix.) The flag only affects the `ImageBitmap`. `drawImage` into a 2D canvas stores premultiplied pixels anyway, and `getImageData` un-premultiplies them, so low-alpha pixels still lose precision.

**Fix:** when no resize is needed, decode the PNG bytes directly, for example with `fast-png` or `UPNG.js`, or with the pure-JS decoder already in `scripts/convert-cli.js`. Use the canvas path only for downscaling.

## 7. P2: `npm run check` fails on a clean clone

- **Lint:** `tools/parity/trace.mjs` errors with `'process' is not defined` and `'console' is not defined`. Add `tools/` to the eslint `ignores`, or give it node globals.
- **Tests:** 9 tests (in `paletteSnap.test.ts` and `majorityVote.test.ts`) read fixtures from `/tmp/ps_*.png.*` and `/tmp/mv_*`, which only exist on the harness machine. On Windows they fail with `ENOENT C:\tmp\...`. Guard them with `it.skipIf(!existsSync(path))`, or generate the fixtures in the test.
- **Missing tests:** there are none for `buildResidualLayer`. Add unit tests (no residual when the prediction is exact, correct runs and colors, `fill-opacity` for partial alpha) plus the resvg end-to-end check from item 5.

## 8. P2: cleanup now that the residual layer exists

- `recolorPaletteFills`: the coverage-vote code after `fills.push(keyToRgb(modeKey)); continue;` (`binaryLayers.ts:315-345`) is unreachable. Delete it, and fix the comments that still describe the flat-region guard and tie-break.
- **Tiny-layer snap** (`:350`) and **`splitSoupRanks`** (`:705`) existed only to work around the ±24 objective:
  - The snap overrides the mode fill, which is exactly the fill that minimizes residual size.
  - Soup sub-balls pick fills by ±24 coverage (not mode), and each one re-traces a nested full-canvas mask.

  Measure SVG size with both disabled. The expectation is the same 100% exactness in fewer bytes.
- **`buildResidualLayer` efficiency** (`:557`):
  - Pixels are visited in row-major order already, so the `{x, y}` objects and `pixels.sort` (`:640`) are unnecessary. Keep a `number[]`/`Int32Array` of `p` per color, or build runs in the same pass.
  - Merge vertically adjacent runs of the same width.
  - The Goose images produce 30-67k residual colors, so this pass dominates both runtime and output size.
- **Worker:** the `// v1.0.33: force rebuild` comment is stale. `stripPtUnits` sits above the imports; move it below them, or remove it after the Rust fix.

## 9. P3: still open from the first review

- **Full resolution** (item 2). The residual layer makes the cost predictable, since it's proportional to the number of mismatched pixels. The remaining obstacle is memory in `recolorPaletteFills` (`number[][]` of every pixel) and in the per-layer RGBA masks.
- **Compare UI** (item 9): no 1:1 view, no difference overlay, no checkerboard. The UI parts are in `design.md`.

## Suggested order

1. Item 1 (one character) plus its tests. This makes every binary-path image exact on any background.
2. Items 5 and 7: the resvg vitest suite, lint ignore, and fixture guards, so every later change is measured on the real code.
3. Items 3 and 4 (small).
4. Item 2 (color-path residual layer and display size).
5. Items 6, 8, and 9.
