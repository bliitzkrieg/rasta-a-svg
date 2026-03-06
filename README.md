# Raster to Vector Lab

Client-side Next.js PWA that converts PNG images into layered SVG, EPS, and DXF files.

## Features

- Multiple PNG upload with sequential queue processing
- Client-only vectorization in a Web Worker
- Layered exports (one layer per quantized color)
- Compare mode with before/after slider
- Offline support via service worker
- Session persistence via IndexedDB + localStorage

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```
