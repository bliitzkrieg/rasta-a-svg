/** Primary navigation, shared by the site header and its mobile menu. */
export const PRIMARY_NAV = [
  { href: "/", label: "PNG to SVG" },
  { href: "/png-to-eps", label: "PNG to EPS" },
  { href: "/png-to-dxf", label: "PNG to DXF" },
  { href: "/guides", label: "Guides" },
  { href: "/faq", label: "FAQ" },
] as const;

/** Footer link columns. */
export const FOOTER_COLUMNS = [
  {
    title: "Converters",
    links: [
      { href: "/", label: "PNG to SVG" },
      { href: "/png-to-eps", label: "PNG to EPS" },
      { href: "/png-to-dxf", label: "PNG to DXF" },
      { href: "/jpg-to-svg", label: "JPG to SVG" },
      { href: "/image-to-svg", label: "Image to SVG" },
    ],
  },
  {
    title: "Guides",
    links: [
      { href: "/guides/how-to-convert-png-to-svg", label: "How to convert PNG to SVG" },
      { href: "/guides/png-vs-svg", label: "PNG vs SVG" },
      { href: "/guides/what-is-vectorization", label: "What is vectorization" },
      { href: "/svg-for-cricut", label: "SVG files for Cricut" },
      { href: "/logo-to-vector", label: "Convert a logo to vector" },
      { href: "/guides", label: "All guides" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" },
      { href: "/faq", label: "FAQ" },
    ],
  },
] as const;

export const CONTACT_EMAIL = "hello@png2svg.io";
