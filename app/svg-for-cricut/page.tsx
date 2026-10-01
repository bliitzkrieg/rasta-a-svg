import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Make SVG files for Cricut from any PNG, free in your browser. Get clean, layered cut files and import them into Cricut Design Space. No sign-up, no uploads.";

export const metadata: Metadata = {
  title: "Make SVG Files for Cricut from a PNG",
  description,
  alternates: { canonical: "/svg-for-cricut" },
  openGraph: {
    title: "Make SVG Files for Cricut from a PNG",
    description,
    url: "https://png2svg.io/svg-for-cricut",
  },
};

const faqs = [
  {
    question: "Why should I use Clean SVG instead of the regular SVG for Cricut?",
    answer:
      "The regular Pixel-perfect SVG includes a correction layer made of tiny rectangles that make the file match the original image pixel for pixel on screen. A cutting machine would try to cut each of those rectangles. Clean SVG leaves that layer out, so Design Space only sees the real shapes.",
  },
  {
    question: "Why does my design show up as several layers in Design Space?",
    answer:
      "Each color in the image becomes its own group of paths in the SVG, and Design Space shows each group as a layer. That is useful for multi-color vinyl projects. If you only want one cut, use the Black & white preset to get a single-color silhouette.",
  },
  {
    question: "Can I use the same file with a Silhouette machine?",
    answer:
      "Silhouette Studio imports the DXF file from the same conversion. Importing SVG into Silhouette Studio requires Designer Edition or higher.",
  },
  {
    question: "Is it free to make Cricut SVG files here?",
    answer:
      "Yes. There is no sign-up and no watermark on your files. Conversion runs in your browser, so your images are never uploaded. The site is supported by ads.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Make SVG Files for Cricut from a PNG",
    url: "https://png2svg.io/svg-for-cricut",
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

export default function SvgForCricutPage() {
  return (
    <ArticleLayout
      title="Make SVG Files for Cricut from a PNG"
      lede="Turn a PNG, JPG, or WebP design into a cut-ready SVG for Cricut Design Space. Convert it below, download the Clean SVG, and upload it as layered shapes."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "SVG for Cricut" },
      ]}
      jsonLd={jsonLd}
      converter={{ defaultFormat: "svg" }}
      showCta={false}
      related={[
        {
          href: "/png-to-dxf",
          title: "PNG to DXF converter",
          description: "Cut files for Silhouette Studio, laser cutters, and CAD software.",
        },
        {
          href: "/image-to-svg",
          title: "Convert any image to SVG",
          description: "Which images make good cut files, and how transparency carries over.",
        },
        {
          href: "/guides/what-is-vectorization",
          title: "What is vectorization?",
          description: "Why some designs trace into clean shapes and others do not.",
        },
      ]}
    >
      <h2>Why Cricut needs an SVG, not a PNG</h2>
      <p>
        Cricut Design Space can open a PNG, but a PNG is just pixels. To cut
        it, Design Space has to guess where the edges are, and for anything
        beyond a simple silhouette that guess is often rough. An SVG already
        describes every shape as a path, so the machine follows exact outlines.
        Each color comes in as a separate layer, which is what you want for
        multi-color vinyl, layered paper, and iron-on projects.
      </p>
      <p>
        The converter on this page does the tracing for you in the browser.
        Your design is never uploaded, there is no sign-up, and the file you
        download has no watermark.
      </p>

      <h2>Pick the right output for cutting</h2>
      <p>
        Two choices make the biggest difference to how well a file cuts.
      </p>
      <h3>Download the Clean SVG</h3>
      <p>
        The default Pixel-perfect preset adds a correction layer of tiny
        rectangles so the SVG matches your image pixel for pixel on screen.
        That is great for display, but a cutting machine would treat every one
        of those rectangles as something to cut. Use the <strong>Clean SVG</strong>{" "}
        download instead. It is the same design without the correction layer,
        so Design Space only sees the real shapes.
      </p>
      <h3>Use Black & white for single-color cuts</h3>
      <p>
        If you are cutting one color of vinyl, a stencil, or a single sheet of
        cardstock, choose the <strong>Black & white</strong> preset. It turns
        the design into a single-color silhouette, so you get one clean cut
        layer instead of several color layers you would have to merge later.
        For multi-color projects, stay with the color result and let each
        color become its own layer.
      </p>
      <p>
        If the design has lots of tiny fragments, try the{" "}
        <strong>Smaller file</strong> preset. It simplifies the paths, which
        often means fewer small pieces to weed.
      </p>

      <AdSlot name="articleInline" minHeight={280} />

      <h2>How to upload your SVG to Cricut Design Space</h2>
      <ol>
        <li>
          <strong>Convert your image.</strong> Drop your PNG, JPG, or WebP onto
          the converter at the top of this page and pick a preset.
        </li>
        <li>
          <strong>Check the result.</strong> Drag the compare slider across the
          preview to see the traced shapes against the original. Look for thin
          lines or small dots that may be too delicate to cut.
        </li>
        <li>
          <strong>Download the Clean SVG.</strong> Save it somewhere easy to
          find, such as your desktop.
        </li>
        <li>
          <strong>Open Design Space and choose Upload.</strong> In a new or
          existing project, click Upload, then Upload Image.
        </li>
        <li>
          <strong>Select the SVG and upload it.</strong> Browse to the file you
          downloaded, select it, and click Upload. Then add it to your canvas.
        </li>
        <li>
          <strong>Work with the layers.</strong> The design appears as a group
          of layers, one per color. You can hide layers you do not want to cut,
          change their colors, or delete a background layer.
        </li>
      </ol>

      <h2>Layers become colors</h2>
      <p>
        Every color the converter finds becomes its own group of paths in the
        SVG, and Design Space reads each group as a separate layer. In
        practice that means each layer can be assigned its own material
        color, and Design Space typically lays out each color on its own mat
        when you send the project to cut.
      </p>
      <p>
        A design with more colors than you plan to cut is easy to fix. Hide or
        delete the layers you do not need, or change two layers to the same
        color if you want them cut from the same sheet. If you end up removing
        most of the layers, the Black & white preset might have been the
        quicker route.
      </p>
      <p>
        Combining shapes is done inside Design Space. Its welding and attaching
        tools let you merge overlapping shapes into one outline or keep pieces
        in position relative to each other on the mat. The converter does not
        do this for you, and that is usually a good thing: you decide which
        parts belong together after you see the layers.
      </p>

      <h2>Sizing tips</h2>
      <ul>
        <li>
          <strong>Resize in Design Space, not before.</strong> The SVG is a
          vector, so you can scale it to the size of your project without
          losing sharpness. There is no need to enlarge the PNG first.
        </li>
        <li>
          <strong>Start with a large, clean image.</strong> More pixels give
          the tracer more edge detail. Images larger than 1000 px on the long
          edge are traced at 1000 px, and the SVG keeps the original display
          size.
        </li>
        <li>
          <strong>Watch small details when scaling down.</strong> A thin line
          that looks fine on a large decal can become too fragile to cut or
          weed on a small one. Check the smallest parts of the design at the
          final size before you cut.
        </li>
        <li>
          <strong>Do a test cut.</strong> Try a small version on scrap
          material first, especially with a new design or material.
        </li>
      </ul>

      <h2>What kinds of images make good cut files</h2>
      <p>
        Bold shapes and flat colors work best: logos, lettering, clip art,
        line drawings, and simple illustrations. Photos are a poor fit. They
        trace into huge numbers of tiny shapes, which cut badly and take a
        long time to weed. If you are starting from a JPG, the{" "}
        <Link href="/jpg-to-svg">JPG to SVG guide</Link> explains how to
        handle compression noise. Using a Silhouette machine instead? The{" "}
        <Link href="/png-to-dxf">DXF export</Link> from the same conversion
        imports into Silhouette Studio.
      </p>

      <h2>Cricut SVG FAQ</h2>
      {faqs.map((faq) => (
        <div key={faq.question}>
          <h3>{faq.question}</h3>
          <p>{faq.answer}</p>
        </div>
      ))}
    </ArticleLayout>
  );
}
