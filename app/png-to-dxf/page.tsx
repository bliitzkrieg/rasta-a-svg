import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "Free PNG to DXF Converter | PNG2SVG.IO",
  description:
    "Convert PNG to DXF free in your browser. Turn PNG images into DXF vector files for laser cutters, CNC machines, and CAD software. No sign-up, no watermarks.",
  alternates: { canonical: "/png-to-dxf" },
};

const faqs = [
  {
    question: "Is converting PNG to DXF free?",
    answer:
      "Yes. PNG to DXF conversion on PNG2SVG.IO is completely free, with no watermarks and no sign-up required.",
  },
  {
    question: "Will the DXF work with my laser cutter or CNC software?",
    answer:
      "The DXF export contains the same layered vector paths as the SVG export, in the widely supported DXF format used by CAD, laser, and CNC software. Most programs import it directly, but always run a test cut with new software.",
  },
  {
    question: "Can I use the DXF file with Silhouette Studio?",
    answer:
      "Yes. Silhouette Studio Designer Edition and above can import DXF files, which makes this converter a free way to prepare PNG artwork for your Silhouette cutting machine.",
  },
  {
    question: "Are my files uploaded to a server during conversion?",
    answer:
      "No. All vectorization runs locally in your browser using WebAssembly. Your PNG files never leave your device.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Free PNG to DXF Converter",
    url: "https://png2svg.io/png-to-dxf",
    description:
      "Convert PNG to DXF free in your browser. Turn PNG images into DXF vector files for laser cutters, CNC machines, and CAD software.",
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
      lede="Turn PNG images into DXF vector files for laser cutters, CNC machines, and CAD software. Free, no sign-up, and your files never leave your browser."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "PNG to DXF" },
      ]}
      jsonLd={jsonLd}
    >
      <h2>What is a DXF file?</h2>
      <p>
        DXF (Drawing Exchange Format) is a CAD vector format created by
        Autodesk for exchanging drawings between programs. Laser cutters, CNC
        routers, plasma cutters, and CAD applications all speak DXF, which
        makes it the standard bridge between a PNG image and a machine that
        cuts physical material.
      </p>
      <h2>When to use DXF instead of SVG</h2>
      <ul>
        <li>
          <strong>Laser cutting and engraving.</strong> Most laser software
          imports DXF toolpaths directly.
        </li>
        <li>
          <strong>CNC routing and milling.</strong> CAM programs that generate
          cutting paths from artwork expect DXF input.
        </li>
        <li>
          <strong>CAD workflows.</strong> AutoCAD, DraftSight, LibreCAD, and
          similar tools open DXF natively.
        </li>
        <li>
          <strong>Silhouette cutting machines.</strong> Silhouette Studio
          (Designer Edition and up) imports DXF files for cutting.
        </li>
      </ul>
      <h2>How to convert PNG to DXF</h2>
      <ol>
        <li>
          <strong>Drop your PNG onto the converter.</strong> Open{" "}
          <Link href="/">png2svg.io</Link> and drag your PNG anywhere onto the
          page. Tracing starts automatically in your browser.
        </li>
        <li>
          <strong>Simplify for cutting.</strong> For laser and CNC work, fewer
          colors and smoother paths cut cleaner. Lower the color count and
          raise smoothing before converting.
        </li>
        <li>
          <strong>Download the DXF.</strong> When tracing finishes, choose the
          DXF export. The SVG and EPS versions are included from the same
          conversion.
        </li>
      </ol>
      <h2>Tips for cutting-ready DXF files</h2>
      <ul>
        <li>
          High-contrast artwork with bold shapes traces into the cleanest cut
          paths. Thin, noisy detail becomes fragile geometry.
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
