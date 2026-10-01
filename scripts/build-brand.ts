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
import { BRAND, markSvg } from "@/lib/brandMark";

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

// Open Graph image (1200x630).
const heroPng = readFileSync(out("examples/hero-logo.png")).toString("base64");
const heroSvg = readFileSync(out("examples/hero-logo.svg")).toString("base64");
const mark = markSvg({ detail: "fine" }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glowA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(120 80) scale(520)">
      <stop offset="0" stop-color="${BRAND.blue}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${BRAND.blue}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1120 600) scale(520)">
      <stop offset="0" stop-color="${BRAND.orange}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${BRAND.orange}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="checker" width="24" height="24" patternUnits="userSpaceOnUse">
      <rect width="24" height="24" fill="#2a2d33"/>
      <rect width="12" height="12" fill="#363a41"/>
      <rect x="12" y="12" width="12" height="12" fill="#363a41"/>
    </pattern>
    <clipPath id="vectorHalf"><rect x="920" y="115" width="200" height="400"/></clipPath>
    <clipPath id="card"><rect x="720" y="115" width="400" height="400" rx="28"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="${BRAND.ink}"/>
  <rect width="1200" height="630" fill="url(#glowA)"/>
  <rect width="1200" height="630" fill="url(#glowB)"/>
  <g transform="translate(80 92) scale(1.25)">${mark}</g>
  <text x="180" y="150" font-family="Manrope" font-weight="800" font-size="52" fill="#ffffff" letter-spacing="-1.5">png2svg<tspan fill="${BRAND.orange}">.io</tspan></text>
  <text x="80" y="282" font-family="Manrope" font-weight="800" font-size="54" fill="#ffffff" letter-spacing="-1.5">Convert PNG to SVG,</text>
  <text x="80" y="346" font-family="Manrope" font-weight="800" font-size="54" fill="${BRAND.orange}" letter-spacing="-1.5">pixel-perfect <tspan fill="#ffffff">and free</tspan></text>
  <text x="80" y="420" font-family="Manrope" font-weight="500" font-size="25" fill="#aab1ba">Layered SVG, EPS and DXF. Runs in your browser.</text>
  <text x="80" y="458" font-family="Manrope" font-weight="500" font-size="25" fill="#aab1ba">No upload, no sign-up, no watermark.</text>
  <g clip-path="url(#card)">
    <rect x="720" y="115" width="400" height="400" fill="url(#checker)"/>
    <image href="data:image/png;base64,${heroPng}" x="750" y="145" width="340" height="340"/>
    <g clip-path="url(#vectorHalf)">
      <image href="data:image/svg+xml;base64,${heroSvg}" x="750" y="145" width="340" height="340"/>
    </g>
  </g>
  <rect x="720" y="115" width="400" height="400" rx="28" fill="none" stroke="#2d3139" stroke-width="2"/>
  <rect x="918.5" y="115" width="3" height="400" fill="${BRAND.orange}"/>
  <g font-family="Manrope" font-weight="800" font-size="18" fill="#ffffff">
    <rect x="736" y="131" width="62" height="30" rx="15" fill="#0f1115" fill-opacity="0.75"/>
    <text x="767" y="152" text-anchor="middle">PNG</text>
    <rect x="1042" y="131" width="62" height="30" rx="15" fill="#0f1115" fill-opacity="0.75"/>
    <text x="1073" y="152" text-anchor="middle">SVG</text>
  </g>
</svg>`;
writeFileSync(out("og-image.png"), png(og, 1200));

console.log("Wrote icon.svg, favicon.ico, logo-mark.svg, icon-192.png, icon-512.png, apple-touch-icon.png, og-image.png");
