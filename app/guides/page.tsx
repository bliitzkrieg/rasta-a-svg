import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Guides to converting images into vectors: PNG to SVG basics, how vectorization works, Cricut cut files, print-ready logos, and EPS and DXF exports.";

export const metadata: Metadata = {
  title: "Guides",
  description,
  alternates: { canonical: "/guides" },
  openGraph: {
    title: "Guides",
    description,
    url: "https://png2svg.io/guides",
  },
};

const guides = [
  {
    href: "/guides/how-to-convert-png-to-svg",
    title: "How to convert PNG to SVG",
    description: "The basic workflow: drop an image, choose a preset, compare, and download.",
  },
  {
    href: "/guides/png-vs-svg",
    title: "PNG vs SVG: what is the difference?",
    description: "Raster pixels versus vector paths, and when each format is the right choice.",
  },
  {
    href: "/guides/what-is-vectorization",
    title: "What is vectorization?",
    description: "How tracing turns a grid of pixels into shapes, and why some images trace better than others.",
  },
  {
    href: "/svg-for-cricut",
    title: "Make SVG files for Cricut",
    description: "Create layered cut files from a PNG and upload them to Cricut Design Space.",
  },
  {
    href: "/logo-to-vector",
    title: "Convert your logo to a vector",
    description: "Get SVG and EPS versions of a logo that printers and sign makers will accept.",
  },
  {
    href: "/png-to-eps",
    title: "PNG to EPS converter",
    description: "EPS files for print shops, stock vector sites, and older design software.",
  },
  {
    href: "/png-to-dxf",
    title: "PNG to DXF converter",
    description: "DXF files for laser cutters, CNC machines, Silhouette Studio, and CAD software.",
  },
  {
    href: "/jpg-to-svg",
    title: "JPG to SVG converter",
    description: "How to get clean vectors from JPG files despite compression noise.",
  },
  {
    href: "/image-to-svg",
    title: "Convert any image to SVG",
    description: "PNG, JPG, and WebP compared as inputs, plus how transparency carries over.",
  },
  {
    href: "/faq",
    title: "Frequently asked questions",
    description: "Short answers about privacy, file limits, formats, presets, and compatibility.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Guides",
  url: "https://png2svg.io/guides",
  description,
  mainEntity: {
    "@type": "ItemList",
    itemListElement: guides.map((guide, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: guide.title,
      url: `https://png2svg.io${guide.href}`,
    })),
  },
};

export default function GuidesPage() {
  return (
    <ArticleLayout
      title="Guides"
      lede="Learn how vectorization works and how to get clean SVG, EPS, and DXF files from your images, whether you are cutting vinyl, sending a logo to a printer, or building a website."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Guides" },
      ]}
      jsonLd={jsonLd}
    >
      <p>
        New to vector files? Start with the first three guides, which explain
        the basics. The guides after that focus on specific jobs and include
        the converter right on the page, so you can follow along with your own
        image. The FAQ collects short answers to common questions.
      </p>
      <ul>
        {guides.map((guide) => (
          <li key={guide.href}>
            <h2>
              <Link href={guide.href}>{guide.title}</Link>
            </h2>
            <p>{guide.description}</p>
          </li>
        ))}
      </ul>
    </ArticleLayout>
  );
}
