# PNG2SVG.IO (Raster to Vector Lab)

Client-side Next.js app that converts PNG images into layered SVG, EPS, and DXF files. All processing runs in the browser via a Web Worker; no images are sent to a server.

## Features

- **Multiple PNG upload** with sequential queue processing
- **Client-only vectorization** in a Web Worker (no server round-trip)
- **Layered exports**: one vector layer per quantized color (SVG, EPS, DXF)
- **Compare mode** with before/after slider
- **Session persistence**: app preferences (theme, slider position, conversion settings) and in-session queue/result data via IndexedDB and localStorage

## Prerequisites

- **Node.js** `>=20.9.0` (see `engines` in `package.json`)
- **npm** (this repo uses `package-lock.json`; npm is the expected package manager)

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run production server (after `build`) |
| `npm run typecheck` | Run TypeScript compiler in no-emit mode |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Run Vitest with coverage |
| `npm run build:vtracer-wasm` | Rebuild the client-side VTracer WASM bundle in `public/vendor/vtracer` |
| `npm run check` | Run typecheck, lint, test, and build (CI-style) |
| `npm run convert:cli` | CLI conversion (see [CLI](#cli)) |

## Project structure

| Path | Purpose |
|------|---------|
| `app/` | Next.js App Router: layout, metadata, global styles, main page |
| `components/` | React UI components (preview, queue, settings, export, etc.) |
| `lib/` | Shared logic: image decode, vectorize option mapping, export (SVG, EPS, DXF), storage (IndexedDB, localStorage) |
| `rust/` | Rust + WASM wrapper around VTracer used by the browser worker |
| `workers/` | Web Worker: loads the VTracer bundle and orchestrates vector export |
| `scripts/` | Utility scripts, including the VTracer WASM build helper and the legacy CLI converter |
| `tests/` | Vitest tests for library and exporter behavior |
| `public/vendor/vtracer/` | Generated browser-ready VTracer WASM artifacts served by Next.js |

## Architecture overview

1. **UI** (`app/page.tsx`, `components/`)
   Handles upload, queue, selection, theme, and export actions. Persists preferences and in-session data.

2. **Worker** (`workers/vectorize.worker.ts`)
   Receives decode-ready image data and settings, loads the client-side VTracer WASM bundle from `public/vendor/vtracer`, traces the image in the worker thread, then produces SVG, EPS, and DXF via `lib/export`.

3. **VTracer WASM wrapper** (`rust/vtracer-wasm`)
   Wraps the Rust `visioncortex` / VTracer pipeline for browser use through `wasm-bindgen`. The generated artifacts are checked into `public/vendor/vtracer` so the web app can run without rebuilding Rust on every install.

4. **Storage**
   - **localStorage** (via `lib/storage/localState.ts`): theme, slider position, conversion settings.
   - **IndexedDB** (via `lib/storage/indexedDb.ts`): file blobs and conversion results for the current session.
   Queue/result rehydration is intentionally limited (for example, preferences only on reload) to avoid stale artifacts across algorithm changes.

5. **Browser requirements**
   Web Workers, IndexedDB, localStorage, and modern ES support. No service worker is used; the app does not register one.

## Rebuilding VTracer WASM

The committed files in `public/vendor/vtracer` are enough to run the web app. Rebuild them only when you change the Rust wrapper.

Prerequisites:

- Rust toolchain from `rustup`
- `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`
- `wasm-bindgen-cli`: `cargo install wasm-bindgen-cli`

Then run:

```bash
npm run build:vtracer-wasm
```

## Testing

- **Scope**: Tests in `tests/` cover pure library behavior (exporters, option mapping, storage, and geometry helpers). There is no UI or E2E test suite yet.
- **Run**: `npm test` (single run), `npm run test:watch`, `npm run test:coverage`.
- **Environment**: Vitest uses Node by default; worker and DOM-dependent code are not exercised in the current suite.

## CLI

The Node script `scripts/convert-cli.js` runs the existing Node-side conversion pipeline on PNG files from disk (for batch or CI use). The web app uses the VTracer WASM worker path described above. Default paths are `example/input` and `example/generated`; create an `example/input` folder and add PNGs, or pass `--input` and `--output`.

Example:

```bash
npm run convert:cli
# Or with custom paths:
node scripts/convert-cli.js --input path/to/pngs --output path/to/out
```

Supported options include `--paletteSize`, `--simplifyTolerance`, `--smoothing`, `--speckleThreshold`, `--cornerThreshold`, `--minLayerCoveragePct`, `--maxPathsPerLayer`, `--minLayerCount`, `--maxLayerCount`, and `--targetPathsPerLayer`. Pass a numeric value after each option.

## Linting and typechecking

- **Lint**: `npm run lint` (ESLint with TypeScript; no `next lint`).
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`).
- **Full check**: `npm run check` runs typecheck, lint, tests, and build.

## Contributing

1. Fork or clone, then `npm install`.
2. Use Node `>=20.9.0` and npm.
3. Make changes and run `npm run check` before opening a PR.
4. When changing the Rust wrapper, regenerate `public/vendor/vtracer` with `npm run build:vtracer-wasm`.

## License

Private / see repository.
