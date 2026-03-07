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
| `npm run check` | Run typecheck, lint, test, and build (CI-style) |
| `npm run convert:cli` | CLI conversion (see [CLI](#cli)) |

## Project structure

| Path | Purpose |
|------|---------|
| `app/` | Next.js App Router: layout, metadata, global styles, main page |
| `components/` | React UI components (preview, queue, settings, export, etc.) |
| `lib/` | Shared logic: image decode, vectorize (quantize, trace, simplify, layers), export (SVG, EPS, DXF), storage (IndexedDB, localStorage) |
| `workers/` | Web Worker: vectorization pipeline (orchestrates lib/vectorize and lib/export) |
| `scripts/` | Node CLI for batch PNG → vector conversion |
| `tests/` | Vitest tests (currently library/export logic; no UI or E2E) |

## Architecture overview

1. **UI** (`app/page.tsx`, `components/`)  
   Handles upload, queue, selection, theme, and export actions. Persists preferences and in-session data.

2. **Worker** (`workers/vectorize.worker.ts`)  
   Receives decode-ready image data and settings, runs quantization → contour tracing → simplification → layer selection, then produces SVG/EPS/DXF via `lib/export`.

3. **Storage**  
   - **localStorage** (via `lib/storage/localState.ts`): theme, slider position, conversion settings.  
   - **IndexedDB** (via `lib/storage/indexedDb.ts`): file blobs and conversion results for the current session.  
   Queue/result rehydration is intentionally limited (e.g. preferences only on reload) to avoid stale artifacts across algorithm changes.

4. **Browser requirements**  
   Web Workers, IndexedDB, localStorage, and modern ES support. No service worker is used; the app does not register one.

## Testing

- **Scope**: Tests in `tests/` cover pure library behavior (exporters, simplification, layer/polygon logic). There is no UI, integration, or E2E test suite yet.
- **Run**: `npm test` (single run), `npm run test:watch`, `npm run test:coverage`.
- **Environment**: Vitest uses Node by default; worker and DOM-dependent code are not exercised in the current suite.

## CLI

The Node script `scripts/convert-cli.js` runs the same vectorization pipeline on PNG files from disk (for batch or CI use). Default paths are `example/input` and `example/generated`; create an `example/input` folder and add PNGs, or pass `--input` and `--output`.

Example:

```bash
npm run convert:cli
# Or with custom paths:
node scripts/convert-cli.js --input path/to/pngs --output path/to/out
```

Supported options include `--paletteSize`, `--simplifyTolerance`, `--smoothing`, `--speckleThreshold`, `--cornerThreshold`, `--minLayerCoveragePct`, `--maxPathsPerLayer`, `--minLayerCount`, `--maxLayerCount`, `--targetPathsPerLayer`. Pass a numeric value after each option.

## Linting and typechecking

- **Lint**: `npm run lint` (ESLint with TypeScript; no `next lint`).
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`).
- **Full check**: `npm run check` runs typecheck, lint, tests, and build.

## Contributing

1. Fork/clone, then `npm install`.
2. Use Node `>=20.9.0` and npm.
3. Make changes; run `npm run check` before opening a PR.
4. Keep behavior of the vectorization pipeline and storage contract in mind when changing `workers/vectorize.worker.ts` or `lib/storage/*`.

## License

Private / see repository.
