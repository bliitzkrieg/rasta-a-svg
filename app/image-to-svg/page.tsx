import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Convert any image to SVG for free: PNG, JPG, or WebP. Learn which images vectorize well and how transparency carries over. Runs in your browser, no uploads.";

export const metadata: Metadata = {
  title: "Convert Any Image to SVG",
  description,
  alternates: { canonical: "/image-to-svg" },
  openGraph: {
    title: "Convert Any Image to SVG",
    description,
    url: "https://png2svg.io/image-to-svg",
  },
};

const faqs = [
  {
    question: "Which image formats can I convert to SVG?",
    answer:
      "PNG, JPG, and WebP files up to 25 MB. Each conversion gives you an SVG, plus EPS and DXF versions of the same result.",
  },
  {
    question: "Will my transparent background stay transparent?",
    answer:
      "Yes. If your PNG or WebP has transparent areas, those areas stay transparent in the SVG. Only the visible parts of the image are traced into shapes. JPG has no transparency, so its background is traced as a solid color.",
  },
  {
    question: "Can I convert a screenshot or a photo to SVG?",
    answer:
      "You can, but results vary. Screenshots of flat interfaces, diagrams, and text convert reasonably well. Photos produce very large SVG files because every gradient has to be described with many small shapes. Vectorization is meant for logos, icons, illustrations, and line art.",
  },
  {
    question: "Why is the SVG the same size as my image even though it was traced smaller?",
    answer:
      "Images larger than 1000 px on the long edge are traced at 1000 px to keep conversion manageable in the browser. The SVG keeps the original display size, so it drops into your layout at the same dimensions as the image you started with.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Convert Any Image to SVG",
    url: "https://png2svg.io/image-to-svg",
    description,
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  },
];

export default function ImageToSvgPage() {
  return (
    <ArticleLayout
      title="Convert Any Image to SVG"
      lede="Drop a PNG, JPG, or WebP file below and get a scalable SVG back. Conversion runs in your browser, so your image is never uploaded, and it is free with no sign-up."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Image to SVG" },
      ]}
      jsonLd={jsonLd}
      converter={{ defaultFormat: "svg" }}
      showCta={false}
      related={[
        {
          href: "/guides/png-vs-svg",
          title: "PNG vs SVG",
          description: "Raster pixels versus vector paths, and when to use each.",
        },
        {
          href: "/jpg-to-svg",
          title: "JPG to SVG converter",
          description: "How to get clean vectors from compressed JPG files.",
        },
        {
          href: "/guides/how-to-convert-png-to-svg",
          title: "How to convert PNG to SVG",
          description: "A step-by-step walkthrough of the converter and its presets.",
        },
      ]}
    >
      <h2>Three input formats, one converter</h2>
      <p>
        The converter above accepts the three image formats you are most
        likely to have on hand: PNG, JPG, and WebP. All three are raster
        formats, meaning they store a grid of colored pixels. The converter
        traces that grid into vector shapes and gives you an SVG, along with{" "}
        <Link href="/png-to-eps">EPS</Link> and{" "}
        <Link href="/png-to-dxf">DXF</Link> versions from the same conversion.
      </p>
      <p>
        The format you start from still matters, because each one stores
        pixels differently. Some keep edges perfectly crisp, some smudge them
        slightly to save space, and only some can store transparency.
      </p>

      <h2>Comparing PNG, JPG, and WebP as inputs</h2>
      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>PNG</th>
            <th>JPG</th>
            <th>WebP</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Compression</td>
            <td>Lossless</td>
            <td>Lossy</td>
            <td>Lossy or lossless</td>
          </tr>
          <tr>
            <td>Transparency</td>
            <td>Yes</td>
            <td>No</td>
            <td>Yes</td>
          </tr>
          <tr>
            <td>Edge quality</td>
            <td>Exact pixels</td>
            <td>Noise and color fringes</td>
            <td>Exact if lossless, softened if lossy</td>
          </tr>
          <tr>
            <td>Typical source</td>
            <td>Exported logos, icons, screenshots</td>
            <td>Photos, images saved from email or social media</td>
            <td>Images saved from websites</td>
          </tr>
          <tr>
            <td>Tracing result</td>
            <td>Cleanest paths</td>
            <td>Can produce extra small shapes</td>
            <td>Clean if lossless, similar to JPG if heavily compressed</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>PNG</strong> is the best starting point when you have a
        choice. It is lossless, so a flat color really is one flat color, and
        it supports transparency.
      </p>
      <p>
        <strong>JPG</strong> is designed for photos. Its compression leaves
        faint blocky noise inside flat areas and halos along edges, which the
        tracer can turn into extra shapes. The{" "}
        <Link href="/jpg-to-svg">JPG to SVG guide</Link> covers how to work
        around that.
      </p>
      <p>
        <strong>WebP</strong> can be either. Many websites serve images as
        WebP, so if you saved a logo from a web page, there is a good chance
        that is what you have. A lossless WebP traces like a PNG. A heavily
        compressed one behaves more like a JPG.
      </p>

      <AdSlot name="articleInline" minHeight={280} />

      <h2>How transparency carries over</h2>
      <p>
        PNG and WebP files can mark pixels as fully or partly transparent.
        When you convert one of these, the transparent areas stay transparent
        in the SVG. Only the visible parts of the image become shapes, so a
        logo on a transparent background comes out as just the logo, ready to
        place on any color.
      </p>
      <p>
        Soft, partly transparent edges are where things get subtle. A logo
        exported with smoothing has a thin ring of semi-transparent pixels
        around every shape. With the default Pixel-perfect preset, those edge
        pixels are reproduced by a separate correction layer of tiny
        rectangles, so the SVG matches the original at its native size. If
        you plan to edit the paths, the Clean SVG download leaves that layer
        out. To cut the design, use the Cricut cut file preset, which snaps
        soft edges to clean outlines.
      </p>
      <p>
        JPG cannot store transparency, so a JPG logo always sits on a solid
        background, usually white. That background is traced like any other
        color and ends up as its own layer, since each color in the output is
        grouped separately. You can delete it in a vector editor such as
        Inkscape or Adobe Illustrator. The Cricut cut file preset removes a
        solid background for you.
      </p>

      <h2>Which images vectorize well</h2>
      <p>
        Format aside, the content of the image decides how good the SVG will
        be. Vectorization describes an image as filled shapes, so it works
        best when the image is already made of shapes.
      </p>
      <ul>
        <li>
          <strong>Great results:</strong> logos, icons, badges, flat
          illustrations, cartoons, line art, lettering, and text.
        </li>
        <li>
          <strong>Good with some cleanup:</strong> scanned drawings,
          signatures, diagrams, and screenshots of simple interfaces. These
          often benefit from the Smaller file preset or a bit of speck removal
          under Advanced settings.
        </li>
        <li>
          <strong>Poor fit:</strong> photographs, soft gradients, and heavy
          texture. These convert, but the SVG can be very large. On very
          large, detailed images the pixel-correction layer may be skipped to
          keep the file size reasonable, and the app tells you when that
          happens.
        </li>
      </ul>
      <p>
        For the background on why, read{" "}
        <Link href="/guides/what-is-vectorization">what vectorization is</Link>.
      </p>

      <h2>Choosing a preset for your image</h2>
      <p>
        The settings panel offers three presets. You can switch between them
        and compare the result against the original with the slider before
        downloading.
      </p>
      <ul>
        <li>
          <strong>Pixel-perfect</strong> is the default. It traces exact pixel
          edges and adds the correction layer, so at its original size the SVG
          matches the source image pixel for pixel.
        </li>
        <li>
          <strong>Smaller file</strong> uses simplified polygon paths. The file
          is much smaller and easier to edit, though no longer pixel-exact.
          This is a good choice for noisy JPG or lossy WebP inputs.
        </li>
        <li>
          <strong>Black & white</strong> produces a single-color silhouette,
          which is what you want for stencils, vinyl, and{" "}
          <Link href="/svg-for-cricut">Cricut cut files</Link>.
        </li>
      </ul>
      <p>
        You can drop several images at once. They queue up and convert one
        after another, and Download all gives you a ZIP with the SVG, EPS, and
        DXF for each file.
      </p>

      <h2>Image to SVG FAQ</h2>
      {faqs.map((faq) => (
        <div key={faq.question}>
          <h3>{faq.question}</h3>
          <p>{faq.answer}</p>
        </div>
      ))}
    </ArticleLayout>
  );
}
