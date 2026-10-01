import type { MetadataRoute } from "next";

/**
 * lastModified is a real per-page date. Update a page's date only when its
 * content changes; stamping every page with the build time teaches search
 * engines to ignore the dates.
 */
const pages: Array<{
  path: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
  lastModified: string;
}> = [
  { path: "", priority: 1, changeFrequency: "weekly", lastModified: "2026-09-30" },
  { path: "/png-to-eps", priority: 0.9, changeFrequency: "monthly", lastModified: "2026-09-30" },
  { path: "/png-to-dxf", priority: 0.9, changeFrequency: "monthly", lastModified: "2026-09-30" },
  { path: "/jpg-to-svg", priority: 0.9, changeFrequency: "monthly", lastModified: "2026-09-30" },
  { path: "/image-to-svg", priority: 0.8, changeFrequency: "monthly", lastModified: "2026-09-30" },
  { path: "/svg-for-cricut", priority: 0.8, changeFrequency: "monthly", lastModified: "2026-09-30" },
  { path: "/logo-to-vector", priority: 0.8, changeFrequency: "monthly", lastModified: "2026-09-30" },
  { path: "/faq", priority: 0.7, changeFrequency: "monthly", lastModified: "2026-09-30" },
  { path: "/guides", priority: 0.6, changeFrequency: "monthly", lastModified: "2026-09-30" },
  {
    path: "/guides/how-to-convert-png-to-svg",
    priority: 0.7,
    changeFrequency: "monthly",
    lastModified: "2026-09-30",
  },
  { path: "/guides/png-vs-svg", priority: 0.7, changeFrequency: "monthly", lastModified: "2026-09-30" },
  {
    path: "/guides/what-is-vectorization",
    priority: 0.7,
    changeFrequency: "monthly",
    lastModified: "2026-09-30",
  },
  { path: "/about", priority: 0.3, changeFrequency: "yearly", lastModified: "2026-09-30" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly", lastModified: "2026-09-30" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly", lastModified: "2026-09-30" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map((page) => ({
    url: `https://png2svg.io${page.path}`,
    lastModified: new Date(page.lastModified),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
