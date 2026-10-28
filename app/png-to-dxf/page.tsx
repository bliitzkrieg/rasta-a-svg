import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Convert PNG to DXF free in your browser. One DXF layer per color, ready for LightBurn, laser cutters, CNC routers, and CAD. No sign-up, no upload.";

export const metadata: Metadata = {
  title: "Free PNG to DXF Converter for Laser and CNC",
  description,
  alternates: { canonical: "/png-to-dxf" },
  openGraph: {
    title: "Free PNG to DXF Converter for Laser and CNC",
    description,
    url: "https://png2svg.io/png-to-dxf",
  },
};

const faqs = [
  {
    question: "Is converting PNG to DXF free?",
    answer:
      "Yes. PNG to DXF conversion on PNG2SVG.IO is free, with no watermarks and no sign-up required. The site is supported by ads.",
  },
  {
    question: "Will the DXF work with my laser cutter or CNC software?",
    answer:
      "The DXF export contains the same traced layers as the SVG export, written as polylines, without the pixel-correction group. It imports into CAD programs such as AutoCAD and LibreCAD and into laser software such as LightBurn. Always run a test cut with new software.",
  },
  {
    question: "Can I use the DXF file with Silhouette Studio?",
    answer:
      "Yes. Silhouette Studio imports DXF files, which makes this converter a free way to prepare PNG artwork for your Silhouette cutting machine. Importing SVG into Silhouette Studio requires Designer Edition, but DXF does not.",
  },
  {
    question: "Are my files uploaded to a server during conversion?",
    answer:
      "No. All vectorization runs locally in your browser using WebAssembly. Your PNG files never leave your device.",
  },
  {
    question: "What units does the DXF use?",
    answer:
      "The coordinates are in pixels, matching your image, and the file carries no unit setting. Your CAD or laser software will assume a unit on import, so set the drawing to the size you want before cutting. The size you set on import is the size that cuts.",
  },
  {
    question: "Does each color get its own layer?",
    answer:
      "Yes. Each color becomes a separate DXF layer named COLOR_01, COLOR_02, and so on. Turn layers off to cut one color at a time, or assign different power and speed settings per layer in software that supports it.",
  },
  {
    question: "Can I send the DXF straight to my machine?",
    answer:
      "Usually, after sizing. Open it, check the size and that the shapes look right, and run a test cut on scrap with a new machine or new software. If the artwork is very detailed, try the Smaller file preset for simpler paths.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Free PNG to DXF Converter for Laser and CNC",
    url: "https://png2svg.io/png-to-dxf",
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

export default function PngToDxfPage() {
  return (
    <ArticleLayout
      title="Free PNG to DXF Converter"
      lede="Turn PNG images into DXF vector files for laser cutters, CNC machines, and CAD software, with one layer per color. Free, no sign-up, and your files never leave your browser."
      updated="October 28, 2026"
      crumbs={[
        { label: "Home", href: "/" },
        { label: "PNG to DXF" },
      ]}
      jsonLd={jsonLd}
      converter={{ defaultFormat: "dxf" }}
      showCta={false}
      related={[
        {
          href: "/guides/how-to-convert-png-to-svg",
          title: "How to Convert PNG to SVG in 3 Steps",
          description: "Presets, settings, and every download format, start to finish.",
        },
        {
          href: "/svg-for-cricut",
          title: "Make SVG files for Cricut",
          description: "Layered cut files from a PNG, ready for Cricut Design Space.",
        },
        {
          href: "/png-to-eps",
          title: "PNG to EPS converter",
          description: "EPS files for print shops and professional design software.",
        },
        {
          href: "/guides/what-is-vectorization",
          title: "What is vectorization?",
          description: "How tracing turns pixels into the paths your machine follows.",
        },
      ]}
    >
      <h2>What is a DXF file?</h2>
      <p>
        DXF (Drawing Exchange Format) is a CAD vector format created by
        Autodesk for exchanging drawings between programs. Laser cutters, CNC
        routers, plasma cutters, and CAD applications all speak DXF, which
        makes it the standard bridge between a PNG image and a machine that
        cuts physical material. A DXF file is plain text: it lists layers
        and the straight-edged outlines, called polylines, that sit on them,
        so almost any CAD or cutting program can read it.
      </p>
      <h2>What is in the DXF file?</h2>
      <p>
        Every conversion downloads the same traced layers as the SVG export,
        written as DXF polylines. Each color in your image becomes its own
        layer, named COLOR_01, COLOR_02, and so on, so you can turn colors
        on and off in your software or give each layer its own cut settings.
        Outlines are written as LWPOLYLINE entities: polylines that follow
        the traced shapes, with closed shapes kept closed and inner
        contours, like the hole in the letter O, written as their own
        polylines on the same layer.
      </p>
      <p>
        Coordinates are in pixel units, matching your image, and the file
        carries no unit declaration. Your software will not know whether a
        number means millimeters or inches until you tell it, so set the
        drawing to the size you want on import. The coordinates are flipped
        vertically from image space, so the drawing reads right-side up in
        CAD coordinates.
      </p>
      <p>
        The DXF never includes the pixel-correction layer from Pixel-perfect
        mode. That layer is thousands of 1 px squares that exist only to
        make the SVG match the source image pixel for pixel, and your
        machine should never try to cut them.
      </p>
      <h2>When to use DXF instead of SVG</h2>
      <ul>
        <li>
          <strong>Laser cutting and engraving.</strong> Most laser software,
          including LightBurn, imports DXF directly.
        </li>
        <li>
          <strong>CNC routing and milling.</strong> CAM programs that generate
          cutting paths from artwork expect DXF input.
        </li>
        <li>
          <strong>CAD workflows.</strong> AutoCAD, LibreCAD, and similar tools
          open DXF natively.
        </li>
        <li>
          <strong>Silhouette cutting machines.</strong> Silhouette Studio
          imports DXF files for cutting, without needing Designer Edition.
        </li>
      </ul>
      <p>
        Cutting on a Cricut instead? Design Space works with SVG. See{" "}
        <Link href="/svg-for-cricut">making SVG files for Cricut</Link>.
      </p>

      <AdSlot name="articleInline" minHeight={280} />

      <h2>How to convert PNG to DXF</h2>
      <ol>
        <li>
          <strong>Drop your PNG onto the converter.</strong> The converter is
          right at the top of this page. Drag your PNG onto it or pick a file.
          Tracing starts automatically in your browser.
        </li>
        <li>
          <strong>Choose a preset for cutting.</strong> For a single-color cut,
          engraving, or stencil, pick Black &amp; white to get one clean
          silhouette. For a cut file with a few flat colors and smooth
          outlines, pick Cricut cut file. For multi-color artwork where a
          smaller file matters more than pixel-exact edges, Smaller file
          uses simplified paths that are easier for machines to follow. Drag
          the compare slider to check the result.
        </li>
        <li>
          <strong>Download the DXF.</strong> When tracing finishes, choose the
          DXF export from the download menu. The SVG and{" "}
          <Link href="/png-to-eps">EPS</Link> versions are included from the
          same conversion.
        </li>
      </ol>
      <h2>Sizing the DXF in your software</h2>
      <p>
        Because the file has no units, size it on import, before you set cut
        order or power. In LightBurn or your CAD program, set the width and
        height to the finished size you want, or scale the drawing from a
        feature whose real size you know. A quick test cut on scrap confirms
        both the size and the settings before you commit material.
      </p>
      <h2>Tips for cutting-ready DXF files</h2>
      <ul>
        <li>
          High-contrast artwork with bold shapes traces into the cleanest cut
          paths. Thin, noisy detail becomes fragile geometry.
        </li>
        <li>
          The DXF never includes the pixel-correction layer used by the
          Pixel-perfect SVG, so your machine will not try to cut thousands of
          1 px squares.
        </li>
        <li>
          Closed shapes stay closed and holes stay holes, so letters and
          logos with counters cut correctly. If a shape looks open in your
          software, check the import settings before converting again.
        </li>
        <li>
          If the result has stray specks, increase speck removal under
          Advanced settings and convert again.
        </li>
        <li>
          Very detailed artwork makes dense polylines with thousands of
          points, which can slow older machines. The Smaller file preset
          simplifies the shapes, and speck removal clears stray dots.
        </li>
        <li>
          Transparent parts of your PNG stay empty. The tracer does not draw
          a background shape, so a clear background comes through as open
          space, not as a cut outline.
        </li>
        <li>
          Convert text and logos at the highest resolution you have so curves
          stay smooth.
        </li>
        <li>
          Always do a test cut on scrap material before running a full job,
          especially with a new machine or new software.
        </li>
      </ul>
      <h2>PNG to DXF FAQ</h2>
      {faqs.map((faq) => (
        <div key={faq.question}>
          <h3>{faq.question}</h3>
          <p>{faq.answer}</p>
        </div>
      ))}
    </ArticleLayout>
  );
}
