import type { MetadataRoute } from "next";

const pages: Array<{
  path: string;
  priority: number;
  changeFrequency: "weekly" | "monthly";
}> = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/png-to-eps", priority: 0.9, changeFrequency: "monthly" },
  { path: "/png-to-dxf", priority: 0.9, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
  {
    path: "/guides/how-to-convert-png-to-svg",
    priority: 0.7,
    changeFrequency: "monthly",
  },
  { path: "/guides/png-vs-svg", priority: 0.7, changeFrequency: "monthly" },
  {
    path: "/guides/what-is-vectorization",
    priority: 0.7,
    changeFrequency: "monthly",
  },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map((page) => ({
    url: `https://png2svg.io${page.path}`,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
