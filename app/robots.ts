import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/examples/", "/sw.js"],
    },
    sitemap: "https://png2svg.io/sitemap.xml",
  };
}
