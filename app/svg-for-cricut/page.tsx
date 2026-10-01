import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Make SVG cut files for Cricut from any PNG, free in your browser. One layer per color, smooth cuts, background removed, sized to fit your mat. No sign-up, no uploads.";

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
    question: "Which preset should I use for Cricut?",
    answer:
      "Use the Cricut cut file preset. It is selected automatically on this page. It reduces the design to a few flat colors, removes a solid background, smooths the outlines so the blade follows clean curves, and drops pieces too small to cut or weed. Each color is a single path, so it comes into Design Space as one layer.",
  },
  {
    question: "Why does Design Space say my SVG is too large?",
    answer:
      "Design Space refuses SVG files with more than 5,000 paths. The Pixel-perfect preset can produce far more than that, because it keeps every shade and adds a layer of tiny correction shapes so the file matches the image on screen. A Cricut cut file has one path per color, so it always uploads.",
  },
  {
    question: "What is the difference between Stacked and Sliced?",
    answer:
      "Stacked gives every color a solid base under the colors on top of it, so small alignment errors never leave gaps. That is the usual choice for vinyl, iron-on, and layered paper. Sliced cuts each color exactly where it appears, with no overlap, which suits Infusible Ink and single-sheet inlays.",
  },
  {
    question: "What size will my design be in Design Space?",
    answer:
      "The SVG is written in inches, cropped to the artwork. It uses 96 pixels per inch and is capped at 11.5 inches on the longest side, so it always fits a 12 by 12 inch mat. Resize it freely in Design Space; it is a vector, so it stays sharp.",
  },
  {
    question: "Can I use the same file with a Silhouette machine?",
    answer:
      "Silhouette Studio Designer Edition and higher can import the SVG. The Basic edition cannot open SVG files, but it can import the DXF file from the same conversion.",
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
      lede="Turn a PNG, JPG, or WebP design into a cut-ready SVG for Cricut Design Space. The converter below starts in Cricut mode: a few flat colors, smooth outlines, no background, and one layer per color."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "SVG for Cricut" },
      ]}
      jsonLd={jsonLd}
      converter={{ defaultFormat: "svg", defaultPreset: "cricut" }}
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

      <h2>What Cricut mode does to your design</h2>
      <p>
        A file that looks perfect on screen is not always a good cut file.
        The <strong>Cricut cut file</strong> preset, which this page selects
        for you, prepares the design for the blade:
      </p>
      <ul>
        <li>
          <strong>A few flat colors.</strong> Soft edges and slight shading
          are merged into the main colors, so you get one mat per real color
          instead of dozens of near-identical shades. Choose an exact number
          of colors under the preview, or 1 color for a single silhouette.
        </li>
        <li>
          <strong>No background.</strong> A solid white or colored background
          is removed, and so are the background-colored areas inside letters,
          so an O or an A cuts with its hole.
        </li>
        <li>
          <strong>Smooth outlines.</strong> Edges are traced as curves rather
          than pixel steps, so the blade cuts clean lines quickly.
        </li>
        <li>
          <strong>Nothing too small to weed.</strong> Specks and pinholes
          below the smallest piece setting are dropped.
        </li>
        <li>
          <strong>One layer per color.</strong> Each color is a single path,
          so Design Space shows one layer per color and keeps the pieces in
          place. The file stays far below Design Space&apos;s 5,000-path
          limit.
        </li>
        <li>
          <strong>A real size.</strong> The file is measured in inches,
          cropped to the artwork, and never larger than 11.5 inches, so it
          fits a 12 by 12 inch mat.
        </li>
      </ul>

      <h3>Stacked or Sliced layers</h3>
      <p>
        <strong>Stacked</strong> (the default) gives each color a solid base
        under the colors on top of it. That is how layered vinyl, iron-on and
        paper projects are usually built, and small alignment errors never
        leave gaps. <strong>Sliced</strong> cuts every color exactly where it
        appears, with no overlap, which suits Infusible Ink and inlays.
      </p>
      <p>
        Want the exact on-screen look instead, for printing or the web? Pick
        the <strong>Pixel-perfect</strong> preset. Those files are not meant
        for cutting: they keep every shade and can exceed Design Space&apos;s
        path limit.
      </p>

      <AdSlot name="articleInline" minHeight={280} />

      <h2>How to upload your SVG to Cricut Design Space</h2>
      <ol>
        <li>
          <strong>Convert your image.</strong> Drop your PNG, JPG, or WebP onto
          the converter at the top of this page. Cricut mode is already on.
        </li>
        <li>
          <strong>Check the result.</strong> Drag the compare slider across the
          preview to see the cut shapes against the original. If two colors
          you wanted separate were merged, raise the number of colors; if
          there are too many mats, lower it.
        </li>
        <li>
          <strong>Download the SVG.</strong> Save it somewhere easy to find,
          such as your desktop.
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
          with one layer per color. Change a layer&apos;s color to match your
          material, or hide a layer you do not want to cut.
        </li>
      </ol>

      <h2>Layers become colors</h2>
      <p>
        Every color in the cut file is one layer in Design Space, and each
        layer can be assigned its own material. When you click Make It,
        Design Space lays out each color on its own mat. Want two colors cut
        from the same sheet? Give both layers the same color in Design Space.
      </p>
      <p>
        Combining shapes is done inside Design Space. Weld merges overlapping
        shapes into one outline, and Attach keeps separate pieces in position
        on the mat. Each color in the file is already a single shape, so its
        pieces stay where they belong without attaching them.
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
          edge are traced at 1000 px.
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
        long time to weed. JPG files work too: Cricut mode merges compression
        noise into the main colors. See the{" "}
        <Link href="/jpg-to-svg">JPG to SVG guide</Link> for tips. Using a
        Silhouette machine with the Basic edition of Silhouette Studio? It
        cannot open SVG files, but the{" "}
        <Link href="/png-to-dxf">DXF export</Link> from the same conversion
        imports fine.
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
