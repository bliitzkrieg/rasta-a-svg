import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Vectorization explained: how raster images like PNG become vector paths, what vectorizes well and what does not, and how tracing presets change the result.";

export const metadata: Metadata = {
  title: "What Is Vectorization? Raster to Vector Explained",
  description,
  alternates: { canonical: "/guides/what-is-vectorization" },
  openGraph: {
    title: "What Is Vectorization? Raster to Vector Explained",
    description,
    url: "https://png2svg.io/guides/what-is-vectorization",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "What Is Vectorization? Raster to Vector Explained",
  url: "https://png2svg.io/guides/what-is-vectorization",
  description,
};

export default function WhatIsVectorizationPage() {
  return (
    <ArticleLayout
      title="What is vectorization?"
      lede="Vectorization is the process of turning a raster image, a grid of pixels, into a vector image made of mathematical paths. It is how a PNG becomes an infinitely scalable SVG."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Guides", href: "/guides" },
        { label: "What is vectorization" },
      ]}
      jsonLd={jsonLd}
      related={[
        {
          href: "/guides/png-vs-svg",
          title: "PNG vs SVG",
          description: "The practical differences between raster and vector files.",
        },
        {
          href: "/image-to-svg",
          title: "Convert any image to SVG",
          description: "How PNG, JPG, and WebP behave as inputs for tracing.",
        },
        {
          href: "/guides/how-to-convert-png-to-svg",
          title: "How to convert PNG to SVG",
          description: "Put the theory into practice in three steps.",
        },
      ]}
    >
      <h2>Raster vs vector, in one paragraph</h2>
      <p>
        A raster image like PNG records color per pixel. A vector image like
        SVG records shapes: this region is a red circle, that region is a blue
        curve. Because shapes are math, not pixels, vectors scale forever
        without blurring. Vectorization, also called tracing or raster-to-vector
        conversion, is the algorithmic jump from one representation to the
        other. For a side-by-side comparison of the two formats, see{" "}
        <Link href="/guides/png-vs-svg">PNG vs SVG</Link>.
      </p>
      <h2>How vectorization works</h2>
      <p>
        Tracing algorithms generally work in three stages. The details vary by
        implementation, but the shape of the process is the same everywhere:
      </p>
      <ol>
        <li>
          <strong>Color quantization.</strong> The image is reduced to a
          limited set of flat colors. A photo with millions of colors might be
          simplified to a few dozen representative ones, while a logo may
          already use only three or four.
        </li>
        <li>
          <strong>Path tracing.</strong> For each flat color region, the
          tracer finds its edges and describes them as paths, either following
          the pixel edges exactly or fitting smoother curves and simplified
          polygons along them. This is where the pixel grid becomes geometry.
        </li>
        <li>
          <strong>Stacking and simplification.</strong> The traced regions are
          layered back to front and tiny specks are discarded, producing clean
          layered paths, one layer per color.
        </li>
      </ol>

      <AdSlot name="articleInline" minHeight={280} />

      <h2>What vectorizes well, and what does not</h2>
      <p>
        <strong>Vectorizes well:</strong> logos, icons, typography, clip art,
        cartoons, diagrams, line art, and any artwork with flat colors and
        crisp edges. These trace into compact, accurate paths.
      </p>
      <p>
        <strong>Vectorizes poorly:</strong> photographs, soft gradients, film
        grain, and heavy texture. The tracer has to approximate smooth
        transitions with flat shapes, which takes a huge number of them, so
        the files get very large. That is a property of the technique, not a
        bug in any particular converter.
      </p>
      <h2>Fidelity versus simplicity</h2>
      <p>
        Every tracer balances two goals: matching the original image closely
        and producing simple, light paths. The presets in PNG2SVG.IO sit at
        different points on that scale.
      </p>
      <ul>
        <li>
          <strong>Pixel-perfect.</strong> The default. Paths follow exact pixel
          edges, and a correction layer of tiny rectangles reproduces the
          anti-aliased pixels along each edge. At its original size the SVG
          matches the PNG pixel for pixel.
        </li>
        <li>
          <strong>Smaller file.</strong> Simplified polygon paths. The file is
          much smaller and easier to edit, at the cost of exact pixel matching.
        </li>
        <li>
          <strong>Black & white.</strong> The image is reduced to a single
          color, producing one silhouette. Ideal for stencils, vinyl, and{" "}
          <Link href="/svg-for-cricut">Cricut cut files</Link>.
        </li>
      </ul>
      <p>
        Under Advanced settings you can adjust the individual controls behind
        these presets, such as color detail (how many distinct colors are
        kept), speck removal (how small a region must be before it is
        discarded), and edge style (how outlines are drawn).
      </p>
      <h2>Why client-side vectorization matters</h2>
      <p>
        Traditional converters upload your image to a server, trace it there,
        and send the result back. Client-side vectorization runs the same kind
        of algorithms in your browser with WebAssembly, so your images are
        never uploaded. Files stay in your browser&apos;s local storage until
        you remove them, which keeps private artwork private.
      </p>
      <h2>Try it on your own image</h2>
      <p>
        The fastest way to understand vectorization is to watch it happen.{" "}
        <Link href="/guides/how-to-convert-png-to-svg">
          Convert a PNG to SVG
        </Link>
        , switch between the presets, and drag the compare slider to see how
        each one handles the same edges.
      </p>
    </ArticleLayout>
  );
}
