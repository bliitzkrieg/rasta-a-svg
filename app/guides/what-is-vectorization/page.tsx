import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "What Is Vectorization? Raster to Vector Explained | PNG2SVG.IO",
  description:
    "Vectorization explained: how raster PNG images become vector paths, what vectorizes well, and how tracing settings like color count and smoothing work.",
  alternates: { canonical: "/guides/what-is-vectorization" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "What Is Vectorization? Raster to Vector Explained",
  url: "https://png2svg.io/guides/what-is-vectorization",
  description:
    "Vectorization explained: how raster PNG images become vector paths, what vectorizes well, and how tracing settings work.",
};

export default function WhatIsVectorizationPage() {
  return (
    <ArticleLayout
      title="What is vectorization?"
      lede="Vectorization is the process of turning a raster image, a grid of pixels, into a vector image made of mathematical paths. It is how a PNG becomes an infinitely scalable SVG."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Guides", href: "/guides/how-to-convert-png-to-svg" },
        { label: "What is vectorization" },
      ]}
      jsonLd={jsonLd}
    >
      <h2>Raster vs vector, in one paragraph</h2>
      <p>
        A raster image like PNG records color per pixel. A vector image like
        SVG records shapes: this region is a red circle, that region is a blue
        curve. Because shapes are math, not pixels, vectors scale forever
        without blurring. Vectorization, also called tracing or raster-to-vector
        conversion, is the algorithmic jump from one representation to the
        other.
      </p>
      <h2>How vectorization works</h2>
      <p>
        Tracing algorithms generally work in three stages. The details vary by
        implementation, but the shape of the process is the same everywhere:
      </p>
      <ol>
        <li>
          <strong>Color quantization.</strong> The image is reduced to a fixed
          number of flat colors. A photo with millions of colors might be
          simplified to 16 representative ones. This is the{" "}
          <strong>color count</strong> setting you see in converters.
        </li>
        <li>
          <strong>Path tracing.</strong> For each flat color region, the
          tracer finds its edges and fits smooth curves (usually Bezier curves)
          along them. This is where the pixel grid becomes geometry.
        </li>
        <li>
          <strong>Stacking and simplification.</strong> The traced regions are
          layered back to front and tiny specks are discarded, producing clean
          layered paths, one layer per color.
        </li>
      </ol>
      <h2>What vectorizes well, and what does not</h2>
      <p>
        <strong>Vectorizes well:</strong> logos, icons, typography, clip art,
        cartoons, diagrams, and any artwork with flat colors and crisp edges.
        These trace into compact, accurate paths.
      </p>
      <p>
        <strong>Vectorizes poorly:</strong> photographs, soft gradients, film
        grain, and heavy texture. The tracer has to approximate smooth
        transitions with flat shapes, so photos come out stylized and
        posterized. That is a property of the technique, not a bug in any
        particular converter.
      </p>
      <h2>Understanding the settings</h2>
      <ul>
        <li>
          <strong>Color count.</strong> More colors preserve subtle shading
          but produce busier files. Fewer colors give bold, simple shapes.
        </li>
        <li>
          <strong>Detail.</strong> Controls how small a feature must be before
          the tracer keeps it. Lower detail drops noise and specks.
        </li>
        <li>
          <strong>Smoothing.</strong> Rounds off jagged pixel stair-steps into
          flowing curves. Essential for cutting machines and clean logos.
        </li>
      </ul>
      <h2>Why client-side vectorization matters</h2>
      <p>
        Traditional converters upload your image to a server, trace it there,
        and send the result back. Client-side vectorization runs the same
        algorithms in your browser with WebAssembly, so your files never leave
        your device. It is faster for typical images, works offline once
        loaded, and keeps private artwork private.
      </p>
      <h2>Try it on your own image</h2>
      <p>
        The fastest way to understand vectorization is to watch it happen.{" "}
        <Link href="/guides/how-to-convert-png-to-svg">
          Convert a PNG to SVG
        </Link>{" "}
        and experiment with the color count to see quantization in action.
      </p>
    </ArticleLayout>
  );
}
