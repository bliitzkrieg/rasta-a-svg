import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PNG2SVG.IO: Free PNG to SVG Converter",
    short_name: "PNG2SVG",
    description:
      "Convert PNG to SVG free in your browser. Pixel-perfect layered vectors for Cricut, laser cutting and print. Also exports EPS and DXF. No upload, no sign-up.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f3",
    theme_color: "#2281b3",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
