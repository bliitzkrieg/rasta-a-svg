import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "FAQ: Free PNG to SVG Converter | PNG2SVG.IO",
  description:
    "Answers about the free PNG to SVG converter: pricing, privacy, file limits, Cricut and laser cutter compatibility, batch conversion, and getting clean vector results.",
  alternates: { canonical: "/faq" },
};

const faqs = [
  {
    question: "How do I convert a PNG to SVG?",
    answer:
      "Drop your PNG onto the page and PNG2SVG.IO vectorizes it automatically in your browser. When the conversion finishes, download the SVG (or EPS/DXF) with one click. No account or installation needed.",
  },
  {
    question: "Is this PNG to SVG converter free?",
    answer:
      "Yes. Converting PNG to SVG, EPS, and DXF is completely free, with no watermarks and no sign-up required.",
  },
  {
    question: "Do I need to create an account?",
    answer:
      "No. There is no sign-up, no login, and no email required. Open the page, convert, and download.",
  },
  {
    question: "Are my images uploaded to a server?",
    answer:
      "No. All vectorization runs locally in your browser using WebAssembly. Your PNG files never leave your device, so your artwork stays private.",
  },
  {
    question: "What formats can I export besides SVG?",
    answer:
      "Every conversion also produces EPS and DXF files. Each export keeps the same layered structure, with one vector layer per quantized color. Note: the pixel-correction layer (which ensures the SVG is pixel-perfect) is SVG-only and is not included in EPS/DXF exports, since those formats are intended for cutting workflows where single-pixel rectangles are not useful.",
  },
  {
    question: "Will the SVG work with Cricut Design Space?",
    answer:
      "Yes. The SVG exports use clean layered paths, one layer per color, which import directly into Cricut Design Space, Silhouette Studio (via the DXF export), and most laser cutter software. For cutting, use the \"Download clean SVG\" option: it strips the pixel-correction layer (thousands of tiny 1px rectangles that make the on-screen preview pixel-perfect but would slow down a cutter). Note that EPS and DXF exports also exclude pixel corrections, as they're meant for print and CAD workflows.",
  },
  {
    question: "Is there a file size limit?",
    answer:
      "Files up to 25 MB are accepted. Very large images are scaled down so the longest side is 1000 pixels before tracing, which keeps conversion fast in the browser.",
  },
  {
    question: "Can I convert multiple PNGs at once?",
    answer:
      "Yes. Drop several PNGs and they queue up for conversion. Download each result individually or grab everything at once as a ZIP file.",
  },
  {
    question: "What kind of PNG vectorizes best?",
    answer:
      "Flat colors, sharp edges, and high resolution: logos, icons, illustrations, and text. Photos also convert, but they come out posterized because vectorization reduces smooth gradients to flat color regions.",
  },
  {
    question: "How do I get cleaner vector results?",
    answer:
      "Start with the highest resolution PNG you have, and prefer artwork with flat colors and sharp edges over photos. Then raise the color count for detail, or lower it for simpler, smoother shapes.",
  },
  {
    question: "Which browsers are supported?",
    answer:
      "Any modern browser with WebAssembly support: current versions of Chrome, Edge, Firefox, and Safari, on desktop and mobile.",
  },
  {
    question: "Can I use the converted files commercially?",
    answer:
      "Yes. You keep all rights to your own artwork and to the vector files generated from it. PNG2SVG.IO claims no ownership over your files.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "FAQ: Free PNG to SVG Converter",
    url: "https://png2svg.io/faq",
    description:
      "Answers about the free PNG to SVG converter: pricing, privacy, file limits, Cricut and laser cutter compatibility, batch conversion, and getting clean vector results.",
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

export default function FaqPage() {
  return (
    <ArticleLayout
      title="Frequently asked questions"
      lede="Everything about converting PNG to SVG, EPS, and DXF with PNG2SVG.IO: pricing, privacy, limits, compatibility, and quality tips."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "FAQ" },
      ]}
      jsonLd={jsonLd}
    >
      {faqs.map((faq) => (
        <div key={faq.question}>
          <h2>{faq.question}</h2>
          <p>{faq.answer}</p>
        </div>
      ))}
      <h2>Still curious how it works?</h2>
      <p>
        Read <Link href="/guides/what-is-vectorization">what vectorization is</Link> to
        understand how a PNG becomes vector paths, or jump straight to the{" "}
        <Link href="/">free converter</Link>.
      </p>
    </ArticleLayout>
  );
}
