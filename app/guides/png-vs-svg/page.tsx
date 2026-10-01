import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "PNG vs SVG explained: raster pixels versus vector paths, when to use each format, how transparency and file size compare, and how to convert a PNG to SVG.";

export const metadata: Metadata = {
  title: "PNG vs SVG: What Is the Difference?",
  description,
  alternates: { canonical: "/guides/png-vs-svg" },
  openGraph: {
    title: "PNG vs SVG: What Is the Difference?",
    description,
    url: "https://png2svg.io/guides/png-vs-svg",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "PNG vs SVG: What Is the Difference?",
  url: "https://png2svg.io/guides/png-vs-svg",
  description,
};

export default function PngVsSvgPage() {
  return (
    <ArticleLayout
      title="PNG vs SVG: what is the difference?"
      lede="PNG and SVG solve opposite problems. PNG stores pixels, which makes it great for photos. SVG stores math, which makes it infinitely scalable. Here is when to use each."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Guides", href: "/guides" },
        { label: "PNG vs SVG" },
      ]}
      jsonLd={jsonLd}
      related={[
        {
          href: "/guides/what-is-vectorization",
          title: "What is vectorization?",
          description: "How a converter turns PNG pixels into SVG paths.",
        },
        {
          href: "/guides/how-to-convert-png-to-svg",
          title: "How to convert PNG to SVG",
          description: "Three steps from a PNG to a scalable vector file.",
        },
        {
          href: "/logo-to-vector",
          title: "Convert your logo to a vector",
          description: "Turn a PNG logo into SVG and EPS files for print.",
        },
      ]}
    >
      <h2>What is PNG?</h2>
      <p>
        PNG is a <strong>raster</strong> format: it stores a fixed grid of
        pixels, each with its own color. It supports transparency and lossless
        compression, which made it the standard for screenshots, photos, and
        web graphics. The tradeoff is resolution dependence. Enlarge a PNG
        beyond its pixel dimensions and it turns blurry or blocky, because
        there is no new detail to reveal.
      </p>
      <h2>What is SVG?</h2>
      <p>
        SVG is a <strong>vector</strong> format: instead of pixels, it stores
        mathematical descriptions of shapes, curves, and colors. An SVG circle
        is defined by its center and radius, not by colored squares. That
        means it renders perfectly sharp at any size, from a 16 pixel favicon
        to a billboard, and the file stays small for simple artwork.
      </p>

      <AdSlot name="articleInline" minHeight={280} />

      <h2>PNG vs SVG at a glance</h2>
      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>PNG</th>
            <th>SVG</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Image type</td>
            <td>Raster (pixels)</td>
            <td>Vector (paths)</td>
          </tr>
          <tr>
            <td>Scaling</td>
            <td>Loses quality when enlarged</td>
            <td>Sharp at any size</td>
          </tr>
          <tr>
            <td>Best for</td>
            <td>Photos, screenshots, complex gradients</td>
            <td>Logos, icons, illustrations, text, cut files</td>
          </tr>
          <tr>
            <td>Transparency</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Editing</td>
            <td>Pixel editors like Photoshop</td>
            <td>Vector editors like Illustrator or Inkscape</td>
          </tr>
          <tr>
            <td>File size</td>
            <td>Grows with dimensions</td>
            <td>Grows with shape complexity</td>
          </tr>
        </tbody>
      </table>
      <h2>When to use PNG</h2>
      <p>
        Keep the PNG when the image is photographic or has smooth gradients
        and fine texture: product photos, screenshots, digital paintings. These
        are exactly the images that vectorize poorly, because their detail
        lives in millions of subtly different pixels.
      </p>
      <h2>When to use SVG</h2>
      <p>
        Convert to SVG when the artwork has defined shapes: logos, icons,
        typography, illustrations, diagrams, and anything destined for a{" "}
        <Link href="/svg-for-cricut">cutting machine</Link>, laser cutter, or
        large format print. SVG is also the
        right format for web graphics that must stay crisp on retina and 4K
        displays.
      </p>
      <h2>Can you convert SVG back to PNG?</h2>
      <p>
        Yes. Rendering an SVG at a chosen pixel size, called rasterizing, is
        built into browsers and design tools. The conversion only loses
        information in one direction: PNG to SVG approximates pixels as
        shapes, while SVG to PNG is exact at whatever resolution you pick.
      </p>
      <h2>Converting your PNG</h2>
      <p>
        If your artwork belongs in the vector column,{" "}
        <Link href="/guides/how-to-convert-png-to-svg">
          convert your PNG to SVG
        </Link>{" "}
        in three steps, or grab the <Link href="/png-to-eps">EPS</Link> and{" "}
        <Link href="/png-to-dxf">DXF</Link> versions for print and CAD
        workflows.
      </p>
    </ArticleLayout>
  );
}
