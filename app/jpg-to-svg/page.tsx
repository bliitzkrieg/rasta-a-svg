import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Convert JPG to SVG free in your browser. Turn JPEG logos and artwork into scalable vectors, with tips for handling compression noise. Nothing is uploaded.";

export const metadata: Metadata = {
  title: "Free JPG to SVG Converter",
  description,
  alternates: { canonical: "/jpg-to-svg" },
  openGraph: {
    title: "Free JPG to SVG Converter",
    description,
    url: "https://png2svg.io/jpg-to-svg",
  },
};

const faqs = [
  {
    question: "Can I convert a JPG to SVG for free?",
    answer:
      "Yes. The converter on this page accepts JPG files up to 25 MB and turns them into SVG, EPS, and DXF files for free, with no sign-up and no watermarks. The site is supported by ads.",
  },
  {
    question: "Why does my traced JPG have lots of tiny shapes?",
    answer:
      "JPG compression adds faint blocky noise and color fringes around edges. The tracer sees those as real color changes and draws a shape for each one. Switch to the Smaller file or Black & white preset, or use the speck removal option in Advanced settings, to cut down on the stray fragments.",
  },
  {
    question: "Is it better to start from a PNG instead of a JPG?",
    answer:
      "If you have both, yes. A PNG of the same artwork has no compression artifacts and often keeps a transparent background, so it traces into cleaner paths. When a JPG is all you have, use the largest version available.",
  },
  {
    question: "Is my JPG uploaded anywhere?",
    answer:
      "No. Conversion runs in your browser with WebAssembly. Your images stay in your browser's local storage until you remove them and are never sent to a server.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Free JPG to SVG Converter",
    url: "https://png2svg.io/jpg-to-svg",
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

export default function JpgToSvgPage() {
  return (
    <ArticleLayout
      title="Free JPG to SVG Converter"
      lede="Turn a JPG logo, icon, or illustration into a scalable SVG right here in your browser. Free, no sign-up, no watermarks, and your image never leaves your device."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "JPG to SVG" },
      ]}
      jsonLd={jsonLd}
      converter={{ defaultFormat: "svg" }}
      showCta={false}
      related={[
        {
          href: "/image-to-svg",
          title: "Convert any image to SVG",
          description: "How PNG, JPG, and WebP compare as inputs, and which images vectorize well.",
        },
        {
          href: "/logo-to-vector",
          title: "Convert your logo to a vector",
          description: "Get a print-ready vector logo when all you have is an image file.",
        },
        {
          href: "/guides/what-is-vectorization",
          title: "What is vectorization?",
          description: "How a grid of pixels becomes a set of scalable paths.",
        },
      ]}
    >
      <h2>Why JPGs are harder to trace than PNGs</h2>
      <p>
        JPG is a lossy format. To keep files small, it throws away detail the
        eye is unlikely to notice in a photo, and it does this in small square
        blocks. That works well for vacation pictures. It works less well for a
        logo with flat colors and crisp edges, which is exactly the kind of
        image you want to turn into a vector.
      </p>
      <p>Look closely at almost any JPG logo and you will find two problems:</p>
      <ul>
        <li>
          <strong>Blocky noise.</strong> Areas that should be one solid color
          are actually a patchwork of slightly different shades, often in a
          faint grid pattern.
        </li>
        <li>
          <strong>Color fringes around edges.</strong> Where a dark shape meets
          a light background, JPG leaves a halo of in-between tones and
          sometimes a tint that was never in the original artwork.
        </li>
      </ul>
      <p>
        A tracer cannot tell the difference between a color you meant and a
        color the compression invented. Each stray shade can become its own
        small shape in the SVG, so a heavily compressed JPG produces more
        paths, a bigger file, and rougher edges than a clean{" "}
        <Link href="/">PNG to SVG</Link> conversion of the same design.
      </p>

      <h2>How to convert JPG to SVG</h2>
      <ol>
        <li>
          <strong>Drop your JPG onto the converter above.</strong> You can also
          pick a file. JPG, PNG, and WebP files up to 25 MB are accepted, and
          tracing starts right away in your browser.
        </li>
        <li>
          <strong>Start with the default preset.</strong> Pixel-perfect is
          selected by default. It traces exact pixel edges and adds a small
          correction layer so the SVG matches the original at its native size.
        </li>
        <li>
          <strong>Compare and adjust.</strong> Drag the compare slider over the
          result to check edges against the original. If you see lots of small
          specks or a very large file, try another preset.
        </li>
        <li>
          <strong>Download.</strong> Save the SVG, or grab the{" "}
          <Link href="/png-to-eps">EPS</Link> and{" "}
          <Link href="/png-to-dxf">DXF</Link> versions from the same
          conversion. Converting several JPGs? Use Download all to get a ZIP.
        </li>
      </ol>

      <AdSlot name="articleInline" minHeight={280} />

      <h2>Tips for cleaner results from a JPG</h2>
      <ul>
        <li>
          <strong>Go back to the source if you can.</strong> If the JPG was
          exported from a design file, a website, or a print proof, ask for or
          re-export the original. A PNG, or even a fresh JPG at high quality,
          traces far better than a copy that has been saved, shared, and
          re-saved several times.
        </li>
        <li>
          <strong>Use the largest JPG you have.</strong> Compression damage is
          a fixed size in pixels, so on a bigger image it covers a smaller
          share of each shape. A thumbnail pulled from a social media profile
          is the worst case. Images larger than 1000 px on the long edge are
          traced at 1000 px, and the SVG keeps the original display size.
        </li>
        <li>
          <strong>Pick Smaller file when noise creates too many shapes.</strong>{" "}
          This preset uses simplified polygon paths, which smooths over a lot of
          the tiny fragments JPG noise produces. The file gets much smaller. It
          will not match the original pixel for pixel, but for a noisy source
          that is often an improvement.
        </li>
        <li>
          <strong>Pick Black & white for single-color cut files.</strong> If
          the artwork is one color on a plain background, this preset
          produces a single silhouette and ignores the color fringes entirely.
          It is a good fit for stencils, vinyl decals, and{" "}
          <Link href="/svg-for-cricut">Cricut projects</Link>.
        </li>
        <li>
          <strong>Try speck removal.</strong> Under Advanced settings you can
          raise speck removal so the tracer drops very small regions. Raise it
          a little at a time and compare, since too much can erase dots and
          thin details you want to keep.
        </li>
      </ul>

      <h2>Photos versus artwork</h2>
      <p>
        Most JPGs are photos, so it is worth being clear about what a vector
        converter is for. Vectorization describes an image as a set of filled
        shapes. A logo with four colors becomes a handful of clean paths.
        A photo of a face, a landscape, or a product has smooth gradients and
        texture everywhere, and describing that with shapes takes an enormous
        number of them.
      </p>
      <p>
        You can still convert a photo, and the converter will do its best. On
        very large, detailed images the Pixel-perfect correction layer may be
        skipped to keep the file size reasonable, and the app will tell you
        when that happens. Expect a very large SVG that is slower to open and
        edit than the JPG you started with. If your goal is to show a photo on
        a website or print it, keep it as a JPG.
      </p>
      <p>
        Good candidates for JPG to SVG conversion include:
      </p>
      <ul>
        <li>Logos and wordmarks saved as JPG by a previous designer or website</li>
        <li>Scanned line art, signatures, and hand lettering</li>
        <li>Icons, badges, and simple illustrations with flat colors</li>
        <li>Diagrams, charts, and screenshots of text-heavy graphics</li>
      </ul>
      <p>
        For a deeper look at why flat artwork traces cleanly and photos do
        not, read{" "}
        <Link href="/guides/what-is-vectorization">what vectorization is</Link>.
      </p>

      <h2>What happens to the white background?</h2>
      <p>
        JPG has no transparency, so a logo saved as JPG always sits on a solid
        background, usually white. That background traces like any other
        color and becomes its own layer in the SVG, because each color in the
        output is grouped separately. If you need the logo on its own, open
        the SVG in a vector editor such as Inkscape or Adobe Illustrator and
        delete the background layer. For cut files, the Black & white preset
        is usually simpler: it traces the artwork as a single-color
        silhouette instead of a stack of color layers.
      </p>

      <h2>JPG to SVG FAQ</h2>
      {faqs.map((faq) => (
        <div key={faq.question}>
          <h3>{faq.question}</h3>
          <p>{faq.answer}</p>
        </div>
      ))}
    </ArticleLayout>
  );
}
