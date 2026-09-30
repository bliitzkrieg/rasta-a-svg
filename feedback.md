# Pixel-perfect SVG feedback

Review of `main` at `073698c` (v1.0.33), including the v1.0.0 to v1.0.33 commit series from the past few days.
Goal: at the same size, the rendered SVG should match the original PNG pixel for pixel.

**Summary:** the last few days of work steadily raised the parity-suite score (about 0.92 to 0.99999). Several problems still block a true pixel-for-pixel match, and the scoring metric can't see most of them. The first three items below are either one-line bugs or clear correctness gaps, and they show up on almost every image. Items 4 and 5 are about measurement: until the harness measures exactly, it will keep reporting ~1.0 on output that isn't pixel perfect. Item 6 is the structural change needed to actually reach zero error.

---

## P0: the output isn't the same size or shape as the PNG

### 1. The SVG is sized in `pt`, so it renders at 133% of the PNG

Every SVG writer emits `width="{w}pt" height="{h}pt"`:

- `rust/vtracer-wasm/src/lib.rs:741` (`build_svg`, color path and every binary-layer sub-trace)
- `lib/vectorize/binaryLayers.ts:611` (the merged binary-layer SVG that ships)
- `lib/export/svg.ts:150` (`toSVG`, currently only used by tests)

1pt = 4/3 CSS px. A 500x500 PNG turns into an SVG whose intrinsic size is 666.67x666.67 px. Anywhere the SVG is shown at its natural size (`<img>` without CSS sizing, Figma/Illustrator import, browser tab, `<object>`), it's 33% larger. It also stops landing on the pixel grid: each source pixel covers 1.333 device pixels, so every exact pixel-corner edge gets anti-aliased.

**Fix:** drop the unit (`width="{w}" height="{h}"`, which means px). This is a one-line change in each writer. The Rust change needs `npm run build:vtracer-wasm`. In the meantime, the worker could rewrite the header on `traced.svg`.

### 2. Images over 1000 px are downscaled before tracing and never scaled back

`lib/image/decode.ts:26` `TARGET_MAX_DIMENSION = 1000`. A 2400x1600 PNG is resampled to 1000x667 with `imageSmoothingQuality = "high"`, traced, and exported with a 1000x667 viewBox and size.

- Even with item 1 fixed, the SVG's intrinsic size doesn't match the PNG.
- Resampling blends neighbouring pixels into new colors. So `originalPixels`, which the recolor passes treat as ground truth, is already a filtered copy and not the original.
- At the original size, about 5.8 source pixels map to each traced pixel, so fine detail is gone for good.

**Fix (minimum):** keep the traced viewBox but set `width`/`height` to the source dimensions, so the display size matches.
**Fix (real):** trace at full resolution, at least in a "pixel-perfect" mode. The limit is performance: the binary path allocates a `w*h*4` mask per layer (52 layers on goose), so full-res needs either a single label-map pass in WASM or a streamed mask built per layer. `CompareSlider.tsx:70` already tells users about the downscale, which is honest but rules out pixel-perfect output for every large input.

### 3. Transparency isn't preserved

There are four separate paths where alpha is lost. The metric can't catch any of them because it composites the reference over white (see item 4).

1. **Binary path paints an opaque background.** `paletteRanksOnOriginals` (`binaryLayers.ts:97`) assigns every pixel a rank, including `alpha == 0` pixels, which it composites to white and snaps to the nearest palette color. Layer 0's mask is `rank >= 0` (`binaryLayers.ts:585`), which is every pixel, so the bottom layer is a full-canvas shape. A logo on a transparent background comes out on a solid white or light-colored rectangle. Commit v1.0.30 does this on purpose ("soft backgrounds are painted instead of left to the page"). That helps the white-composited score but breaks the output on any non-white page.
   **Fix:** give `alpha == 0` pixels rank `-1` so no mask includes them.
2. **Partial alpha gets baked into white.** `compositeAlphaOverWhite` (`lib/image/alphaComposite.ts:56`, gate at 1% partial-alpha pixels) makes anti-aliased fringes opaque and white-blended. The SVG looks correct on white and shows a light halo on any dark or colored background.
3. **Below the 1% gate, alpha is thresholded at 128.** `flatten_alpha` (`lib.rs:336`) runs on both paths, which turns soft edges into hard ones.
4. **Transparent regions can be painted when the keying heuristic misses them.** `should_key_image` (`lib.rs:750`) only samples 5 rows (0, h/4, h/2, 3h/4, h-1) and needs 40% of `width` to be `alpha == 0`. A sticker with an opaque border and a transparent cut-out that misses those rows isn't keyed. Its transparent pixels are then clustered on their leftover RGB and painted, and the recolor turns them white.
   **Fix:** key whenever any `alpha == 0` pixel exists, using a full scan.

**Fix (general):** carry alpha through the whole pipeline. Treat RGBA, not RGB, as the color key. Emit `fill-opacity` per region, using the region's alpha mode or mean from the originals. Don't composite over white. The SVG then matches the PNG on any background.

---

## P1: the metric can't see these errors

### 4. The "honest metric" is too loose for pixel-perfect work

From the code comments and commit messages, the parity harness counts a pixel as a match when its **worst channel is within ±24**, compares against the reference **composited over white**, and rasterizes with its **own rasterizer** (inset 0.25) rather than a browser.

- ±24 per channel is a clearly visible difference (for example `#FF6600` vs `#E74E00`). Two commits already ran into this: v1.0.26 (the suite rewarded a dulled, washed-out orange and a `#F0F0F0` background painted where it should be white) and v1.0.33 (visible halo lines that "the scoring tolerance cannot see"). Both were found by eye, not by the suite. Expect more like them.
- Compositing over white hides everything in item 3.
- A custom rasterizer isn't what users see. Browser anti-aliasing, fill-rule handling, and `pt` scaling (item 1) aren't modelled.
- `parity.py` isn't in the repo. The TS code says it "mirrors parity.py 1:1", but the source of truth can't be reviewed or re-run from a clone.

**Recommendations:**
- Commit the harness, for example under `scripts/parity/`, along with the 18 suite images.
- Render the SVG with a real renderer at DPR 1 and at the PNG's pixel size: `@resvg/resvg-js`, or headless Chromium via Playwright, which is closest to what users see.
- Report exact metrics next to the tolerant one: **% of pixels exactly equal** (RGBA), mean absolute error, max error, PSNR, and p99 ΔE2000.
- Compare RGBA over at least white **and** black (or a checkerboard), so alpha errors count as errors.
- The pipeline is now about 30 hand-tuned gates fitted to 18 images, each tuned for a +0.0001 gain on the same set. Add a held-out image set so a gate that fits only the suite shows up as a regression.

### 5. Fill selection optimizes the ±24 metric, not accuracy

Both recolor passes pick the candidate that covers the most member pixels within ±24:

- `recolorPaletteFills`: `binaryLayers.ts:192` `RECOLOR_TOLERANCE = 24`
- `recolor_cluster_fill`: `lib.rs:486` `TOLERANCE = 24`

Within the tolerance, a color 23 levels off scores the same as an exact match. For a pixel-perfect target:

- To maximize exact matches, the best fill is the region's **mode** color. The v1.0.26 dominant-color guard already does this, but only when the mode reaches 50%. Use the mode everywhere.
- To minimize error, the per-channel **mean** (L2) or **median** (L1) of the visible original pixels is best. That value usually isn't among the top-16 exact colors, so it's never even tried. Add it as a candidate.
- Break ties by total error, not by "keep current".
- The v1.0.33 tiny-layer snap and the v1.0.32 soup split both work around a coverage objective that can't express "closest color". Item 6 makes both unnecessary.

---

## P2: getting to exactly zero error

### 6. Add a residual correction layer (this is the main one)

One flat fill per region can't reproduce anti-aliased edges or gradients exactly: a 1-3 px fringe contains many distinct colors. The current path to higher scores is more layers (tier 8 → 16 → 32, soup splitting), which inflates file size (goose went 2.4 MB → 7.4 MB → 17.4 MB) and still isn't exact.

The pipeline is already in a good position here. **With default settings, every emitted path is an exact pixel-corner walk with integer coordinates:**

- Color path: `mode: "spline"`, `exactFlatPolygons: true`, and `flatClusterMaxDelta: 255`, so every cluster takes `PathSimplifyMode::None`.
- Binary path: `exactFlatPolygons` with `EXACT_FLAT_MIN_AREA = 1`.

So the rendered SVG at 1:1 is fully predictable without rendering: it's just the painted label map (for each pixel, the fill of the topmost region covering it). That means you can:

1. Build the predicted raster in-process: stack the binary masks with their fills, or claim clusters front-to-back with their fills. This is the same visible-set logic `build_color_output` already uses.
2. Compute the residual: pixels where predicted ≠ original RGBA.
3. Group residual pixels by exact RGBA, trace each group with the existing binary tracer (exact walk), and paint them as a final layer on top, with `fill-opacity` for alpha.

With threshold 0, the output is **lossless at 1:1** by construction, for any input. With a threshold T or a byte budget (fix the worst pixels first), there's a single, understandable quality/size control in place of a stack of gates. Add a harness check that the predicted raster equals the real render, which also catches item 1 and any fill-rule problems.

A simpler variant is a user-selectable **"Pixel-perfect" preset**: skip all preprocessing and trace every exact RGBA color's connected components as their own regions. It's exact for flat art, icons, and pixel art. For photos it produces very large files, so gate it on the unique-color count or leave it opt-in.

### 7. Preprocessing moves boundaries that the recolor can't move back

Geometry comes from the prepped pixels (median, unsharp, 64-level posterize, majority vote, palette snap/merge), while fills come from the originals. Recolor fixes colors but not boundaries, so a 1 px edge shifted by the median or vote is baked into the path. The passthrough gates (dither, thin, noise, soft alpha, median damage) exist because of this. In a pixel-perfect mode, trace the raw pixels, or rely on item 6 to patch the moved pixels.

### 8. Decode fidelity

`decode.ts:29/45`: `createImageBitmap(blob)` → `drawImage` → `getImageData`. Canvas 2D stores premultiplied alpha, so low-alpha pixels lose precision when read back (at alpha 10, each RGB channel survives as only 11 distinct levels).

- Use `createImageBitmap(blob, { premultiplyAlpha: "none" })`. Keep the default `colorSpaceConversion`, so values stay in the same sRGB the browser uses to display the PNG.
- Or decode the PNG bytes directly. `scripts/convert-cli.js` already contains a pure-JS PNG decoder.
- Skip the canvas round-trip entirely when no resize is needed (item 2).

---

## P3: comparison UI and cleanup

### 9. The compare view can't show pixel-level differences

`CompareSlider.tsx` and `.compare-base` (`app/globals.css:883-891`) scale both images with `object-fit: contain`. At any zoom other than 1:1, and on any HiDPI display (DPR 1.25/1.5/2 is standard on Windows laptops), the PNG is bilinear-resampled while the SVG is re-rasterized with sharp edges. They look different even when the trace is perfect, and the view can also hide real differences.

- Add an "actual pixels" 1:1 mode at integer zooms, with `image-rendering: pixelated` on the PNG.
- Add a difference overlay (`mix-blend-mode: difference`, or a heatmap) and an "X% pixels identical" readout. Compute it by drawing the SVG into a `w×h` canvas and diffing against `originalPixels`.
- Put the compare canvas on a checkerboard so a painted background (item 3.1) is visible.

### 10. Dead smoothing exporter

`lib/export/svg.ts` `toSVG` builds Catmull-Rom Bézier curves from the polygon points and uses `pt` units. The worker ships `traced.svg` instead, so this only runs in tests. If it's ever wired in, it would undo the exact walks. Either delete it, or fix the units and add a flag to skip smoothing.

### 11. File-size notes (secondary to accuracy, but they compound with item 6)

- Nested binary masks (rank `r` covers every rank ≥ `r`) re-trace the outlines of every layer above, so boundary data grows roughly O(layers × boundary). With exact integer edges at 1:1 there are no seams, so non-nested per-color regions would render identically and be much smaller. The one tradeoff is conflation seams at fractional zoom. A 1 px dilation under the neighboring region fixes that more cheaply than full nesting.
- Exact-walk path data could use relative `h`/`v` commands with no decimals, since coordinates are integers. That would be noticeably smaller than the current absolute coordinates.

---

## Suggested order

1. Item 1 (`pt` → px) and item 3.1 (don't paint the transparent background). These are small, safe, and fix most images immediately.
2. Item 4: commit the harness, render with resvg or Chromium, add the exact-match % and a black-background comparison. Re-baseline. Expect scores to drop, and that drop is the real gap.
3. Item 6 (residual layer): it reaches exactly zero at 1:1 and makes items 5 and 7 and most of the per-image gates optional.
4. Items 2, 3.2-3.4, and 8: full resolution and a real alpha channel.
5. Items 9-11.
