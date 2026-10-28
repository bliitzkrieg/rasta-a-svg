import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "How transparency survives a PNG to SVG conversion: alpha tracing, the background layer, soft edges, and what to do when the background will not go away.";

export const metadata: Metadata = {
  title: "Transparent PNG to SVG: Keeping Transparency in Your Vector",
  description,
  alternates: { canonical: "/guides/transparent-png-to-svg" },
  openGraph: {
    title: "Transparent PNG to SVG: Keeping Transparency in Your Vector",
    description,
    url: "https://png2svg.io/guides/transparent-png-to-svg",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Transparent PNG to SVG: Keeping Transparency in Your Vector",
  url: "https://png2svg.io/guides/transparent-png-to-svg",
  description,
};

export default function TransparentPngPage() {
  return (
    <ArticleLayout
      title="Transparent PNG to SVG"
      lede="A PNG can have see-through pixels. An SVG can too, but only if the tracer treats transparency as part of the image instead of painting over it. Here is how that works, and what to check in the result."
      updated="October 28, 2026"
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Guides", href: "/guides" },
        { label: "Transparent PNG to SVG" },
      ]}
      jsonLd={jsonLd}
      related={[
        {
          href: "/guides/what-is-vectorization",
          title: "What is vectorization?",
          description: "How tracing turns a grid of pixels into shapes.",
        },
        {
          href: "/svg-for-cricut",
          title: "Make SVG files for Cricut",
          description: "Cut files need clean transparency and one layer per color.",
        },
        {
          href: "/guides/why-is-my-svg-file-so-big",
          title: "Why is my SVG file so big?",
          description: "Where the kilobytes go, and how to shrink an SVG.",
        },
      ]}
    >
      <h2>How transparency is traced</h2>
      <p>
        A PNG stores four channels per pixel: red, green, blue, and alpha,
        where alpha says how see-through the pixel is. Fully transparent
        pixels carry no visible color. When this converter traces a PNG,
        transparent areas produce no shapes at all. The SVG background
        stays empty there, so whatever sits behind the SVG shows through,
        exactly like the original PNG.
      </p>
      <p>
        That only works when the source image actually has transparency.
        Many PNGs that look transparent on a website are really a logo on
        a solid white background, saved without an alpha channel. If your
        PNG has no transparent pixels, there is nothing to keep, and the
        background traces as its own layer like any other color.
      </p>

      <h2>The background layer</h2>
      <p>
        When a background does exist in the image, it becomes a layer in
        the SVG, because each color is grouped separately. If you need
        the artwork on its own, open the SVG in Inkscape or Illustrator
        and delete the background layer. It is usually the largest, most
        rectangular shape at the bottom of the layer stack.
      </p>
      <p>
        For cut files, the Black &amp; white preset is usually simpler: it
        traces the artwork as a single-color silhouette and ignores the
        background entirely. That is also the right choice for vinyl
        decals and stencils, where a background layer would cut as a
        solid rectangle.
      </p>

      <h2>Soft edges and shadows</h2>
      <p>
        Not every pixel is fully opaque or fully transparent. Anti-aliased
        edges, drop shadows, and glows live in between, and a tracer has
        to decide what to do with them. Pixels that are almost opaque are
        treated as solid, so edges stay clean instead of dissolving into
        stray fragments. Pixels that are almost transparent are dropped.
        The pixels in the middle become shapes with partial opacity, which
        keeps a soft shadow looking soft in the vector.
      </p>
      <p>
        Very soft shadows still trace into more shapes than a hard edge,
        which is one reason a logo with a heavy glow makes a bigger SVG.
        If the shadow is not part of the design, removing it from the PNG
        before converting gives a cleaner and smaller result.
      </p>

      <h2>JPG has no transparency</h2>
      <p>
        JPG files cannot store an alpha channel, so a logo saved as JPG
        always sits on a solid background, usually white. That background
        traces like any other color. If the original artwork had
        transparency, go back to the PNG or the design file. Converting
        the JPG will give you the right shapes, but the background comes
        with them.
      </p>

      <h2>Checking the result</h2>
      <p>
        Before downloading, drag the compare slider and look at the
        edges. Transparent areas should show the checkerboard behind the
        artwork, not a white fill. Place the downloaded SVG on a colored
        background in your editor as a second check: a leftover white box
        around the artwork means the source PNG had a solid background,
        and the fix is in the source file, not in the converter settings.
      </p>

      <h2>Transparency FAQ</h2>
      <h3>Will my SVG keep the transparent background?</h3>
      <p>
        Yes, if the PNG has real transparent pixels. Transparent areas
        produce no shapes, so the SVG background stays empty and whatever
        is behind it shows through.
      </p>
      <h3>Why does my SVG have a white box around the logo?</h3>
      <p>
        The source PNG almost certainly has a solid white background
        instead of transparency. Re-export the artwork as a PNG with
        transparency from the original design file, then convert again.
      </p>
      <h3>Does the Cricut preset keep transparency?</h3>
      <p>
        Yes. Cricut mode traces flat colors with no background layer, so
        the cut file contains only the artwork shapes, one layer per
        color.
      </p>
      <p>
        Convert your image on the{" "}
        <Link href="/">free converter</Link> and check the transparent
        areas with the compare slider before downloading.
      </p>
    </ArticleLayout>
  );
}
