/**
 * Generates every brand asset from one mark definition.
 *
 * The mark: a circle whose left half is rasterized into pixel cells and
 * whose right half is a perfect vector semicircle, i.e. what the converter
 * does. The pixel cells are computed from the circle, not drawn by hand.
 *
 * Usage: npx tsx scripts/build-brand.ts <font-dir>
 *   <font-dir> must contain Manrope-500.ttf and Manrope-800.ttf (static
 *   instances of Manrope, OFL; only needed for the OG image text).
 *
 * Writes to public/: icon.svg (favicon, coarse cells), favicon.ico, logo-mark.svg
 * (detailed), apple-touch-icon.png, icon-192.png, icon-512.png,
 * og-image.png. The site header renders the mark inline (components/Logo.tsx)
 * using markSvgInner() from lib/brandMark.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { decode } from "fast-png";
import { BRAND, markSvg } from "@/lib/brandMark";
import { boxDownscale } from "@/lib/image/downscale";
import { toRgba8 } from "@/lib/image/toRgba8";
import { traceCutFile } from "@/lib/vectorize/cutFile";
import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import { initSync, trace_rgba_to_json } from "@/public/vendor/vtracer/vtracer_wasm.js";

const fontDir = process.argv[2];
if (!fontDir) {
  console.error("Usage: npx tsx scripts/build-brand.ts <font-dir>");
  process.exit(1);
}
const root = resolve(__dirname, "..");
const out = (name: string) => resolve(root, "public", name);
const fontFiles = [resolve(fontDir, "Manrope-500.ttf"), resolve(fontDir, "Manrope-800.ttf")];

function png(svg: string, width: number): Buffer {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Manrope" },
  })
    .render()
    .asPng();
}

// Favicon: coarse cells so the pixel steps survive at 16-32 px.
writeFileSync(out("icon.svg"), markSvg({ detail: "coarse" }));
// favicon.ico for clients that ignore the SVG icon: PNG-in-ICO, 16/32/48 px.
{
  const coarse = markSvg({ detail: "coarse" });
  const images = [16, 32, 48].map((size) => ({ size, data: png(coarse, size) }));
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  writeFileSync(out("favicon.ico"), Buffer.concat([header, ...images.map((image) => image.data)]));
}
// Detailed mark for large sizes.
const detailed = markSvg({ detail: "fine" });
writeFileSync(out("logo-mark.svg"), detailed);
writeFileSync(out("icon-192.png"), png(detailed, 192));
writeFileSync(out("icon-512.png"), png(detailed, 512));
// iOS rounds the corners itself: give it a full-bleed square.
writeFileSync(out("apple-touch-icon.png"), png(markSvg({ detail: "fine", cornerRadius: 0 }), 180));

// Open Graph image (1200x630): a close-up of a small PNG of the fox, split
// between its pixels blown up and the vector traced from that same small
// PNG, which is the whole pitch in one picture. The vector half is the real
// cut-file trace, so it shows what the tool produces.
const SMALL = 192;
const heroFull = decode(readFileSync(out("examples/hero-logo.png")));
const hero = { width: SMALL, height: SMALL };
const heroPixels = boxDownscale(toRgba8(heroFull), heroFull.width, heroFull.height, SMALL, SMALL);
{
  const wasm = readFileSync(resolve(root, "public/vendor/vtracer/vtracer_wasm_bg.wasm"));
  const wasmCopy = new Uint8Array(wasm.length);
  wasmCopy.set(wasm);
  initSync({ module: wasmCopy.buffer });
}
const heroVector = traceCutFile(
  (w, h, px, opts) => trace_rgba_to_json(w, h, px, opts),
  heroPixels,
  hero.width,
  hero.height,
  { ...DEFAULT_SETTINGS, cutFile: true, cutColors: 0, filterSpeckle: 1 },
);
// previewSvg is framed like the source image (hero-logo pixels).
const vectorPaths = heroVector.previewSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

// The close-up (in hero-logo pixels) and where it sits on the image.
const CROP = { x: 60, y: 75, size: 78 };
const CARD = { x: 712, y: 105, size: 420, radius: 30 };
const zoom = CARD.size / CROP.size;
const divider = CARD.x + CARD.size / 2;
const handleY = CARD.y + CARD.size / 2;
const CARD_FILL = [0x1b, 0x1f, 0x26];

// PNG half: the image's own pixels, drawn as squares at the same zoom.
const pixelBlocks: string[] = [];
for (let y = CROP.y; y < CROP.y + CROP.size; y += 1) {
  for (let x = CROP.x; x < CROP.x + CROP.size / 2; x += 1) {
    const o = (y * hero.width + x) * 4;
    const a = heroPixels[o + 3] / 255;
    if (a === 0) continue;
    const hex = [0, 1, 2]
      .map((c) => Math.round(heroPixels[o + c] * a + CARD_FILL[c] * (1 - a)).toString(16).padStart(2, "0"))
      .join("");
    pixelBlocks.push(
      `<rect x="${(CARD.x + (x - CROP.x) * zoom).toFixed(2)}" y="${(CARD.y + (y - CROP.y) * zoom).toFixed(2)}" width="${(zoom + 0.5).toFixed(2)}" height="${(zoom + 0.5).toFixed(2)}" fill="#${hex}"/>`,
    );
  }
}

const mark = markSvg({ detail: "fine" }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const chip = (x: number, label: string, width: number) =>
  `<g transform="translate(${x} 482)"><rect width="${width}" height="46" rx="23" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.14"/><circle cx="23" cy="23" r="5" fill="${BRAND.orange}"/><text x="39" y="30" font-family="Manrope" font-weight="800" font-size="19" fill="#e8ebef">${label}</text></g>`;
const fill = `#${CARD_FILL.map((v) => v.toString(16)).join("")}`;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glowA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(90 40) scale(560)">
      <stop offset="0" stop-color="${BRAND.blue}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${BRAND.blue}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1000 330) scale(470)">
      <stop offset="0" stop-color="${BRAND.orange}" stop-opacity="0.20"/>
      <stop offset="1" stop-color="${BRAND.orange}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="card"><rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}"/></clipPath>
    <clipPath id="vectorHalf"><rect x="${divider}" y="${CARD.y}" width="${CARD.size / 2}" height="${CARD.size}"/></clipPath>
    <clipPath id="pixelHalf"><rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size / 2}" height="${CARD.size}"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="${BRAND.ink}"/>
  <rect width="1200" height="630" fill="url(#glowA)"/>
  <rect width="1200" height="630" fill="url(#glowB)"/>

  <g transform="translate(70 84) scale(1.1)">${mark}</g>
  <text x="156" y="131" font-family="Manrope" font-weight="800" font-size="44" fill="#ffffff" letter-spacing="-1.2">png2svg<tspan fill="${BRAND.orange}">.io</tspan></text>

  <text x="72" y="272" font-family="Manrope" font-weight="800" font-size="56" fill="#ffffff" letter-spacing="-1.8">Convert PNG to SVG,</text>
  <text x="72" y="340" font-family="Manrope" font-weight="800" font-size="56" fill="${BRAND.orange}" letter-spacing="-1.8">pixel-perfect <tspan fill="#ffffff">and free</tspan></text>
  <text x="72" y="402" font-family="Manrope" font-weight="500" font-size="25" fill="#aab1ba">Tiny PNGs turn into vectors that stay sharp</text>
  <text x="72" y="436" font-family="Manrope" font-weight="500" font-size="25" fill="#aab1ba">at any size. Free, and nothing is uploaded.</text>

  ${chip(72, "SVG · EPS · DXF", 216)}
  ${chip(302, "Cricut-ready", 184)}
  ${chip(500, "No sign-up", 168)}

  <rect x="${CARD.x}" y="${CARD.y + 16}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}" fill="#000000" fill-opacity="0.35"/>
  <g clip-path="url(#card)">
    <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" fill="${fill}"/>
    <g clip-path="url(#pixelHalf)" shape-rendering="crispEdges">${pixelBlocks.join("")}</g>
    <g clip-path="url(#vectorHalf)">
      <g transform="translate(${CARD.x - CROP.x * zoom} ${CARD.y - CROP.y * zoom}) scale(${zoom})">
        <svg width="${hero.width}" height="${hero.height}" viewBox="0 0 ${hero.width} ${hero.height}">${vectorPaths}</svg>
      </g>
    </g>
  </g>
  <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.size}" height="${CARD.size}" rx="${CARD.radius}" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>
  <rect x="${divider - 4}" y="${CARD.y}" width="8" height="${CARD.size}" fill="#ffffff" fill-opacity="0.9"/>
  <rect x="${divider - 2}" y="${CARD.y}" width="4" height="${CARD.size}" fill="${BRAND.orange}"/>
  <circle cx="${divider}" cy="${handleY}" r="25" fill="#ffffff" stroke="${BRAND.orange}" stroke-width="4"/>
  <path d="M${divider - 6} ${handleY - 8} l-8 8 l8 8 M${divider + 6} ${handleY - 8} l8 8 l-8 8" fill="none" stroke="#c2410c" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <g font-family="Manrope" font-weight="800" font-size="18" fill="#ffffff" letter-spacing="0.5">
    <rect x="${CARD.x + 18}" y="${CARD.y + 18}" width="68" height="32" rx="16" fill="#0f1115" fill-opacity="0.8"/>
    <text x="${CARD.x + 52}" y="${CARD.y + 40}" text-anchor="middle">PNG</text>
    <rect x="${CARD.x + CARD.size - 86}" y="${CARD.y + 18}" width="68" height="32" rx="16" fill="#0f1115" fill-opacity="0.8"/>
    <text x="${CARD.x + CARD.size - 52}" y="${CARD.y + 40}" text-anchor="middle">SVG</text>
  </g>
</svg>`;
writeFileSync(out("og-image.png"), png(og, 1200));

console.log("Wrote icon.svg, favicon.ico, logo-mark.svg, icon-192.png, icon-512.png, apple-touch-icon.png, og-image.png");
