import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "Free PNG to EPS Converter | PNG2SVG.IO",
  description:
    "Convert PNG to EPS free in your browser. Vectorize PNG images into scalable EPS files for print and design. No sign-up, no watermarks, files never leave your device.",
  alternates: { canonical: "/png-to-eps" },
};

const faqs = [
  {
    question: "Is converting PNG to EPS free?",
    answer:
      "Yes. PNG to EPS conversion on PNG2SVG.IO is completely free, with no watermarks and no sign-up required.",
  },
  {
    question: "Will the EPS file work with Adobe Illustrator?",
    answer:
      "Yes. The EPS export contains standard vector paths that open in Adobe Illustrator, InDesign, Photoshop, CorelDRAW, and other design software.",
  },
  {
    question: "What is the difference between EPS and SVG?",
    answer:
      "Both are vector formats that scale without quality loss. EPS is a PostScript-based format favored in print workflows and older design software, while SVG is an XML-based format built for the web and cutting machines.",
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
    name: "Free PNG to EPS Converter",
    url: "https://png2svg.io/png-to-eps",
    description:
      "Convert PNG to EPS free in your browser. Vectorize PNG images into scalable EPS files for print and design.",
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

export default function PngToEpsPage() {
  return (
    <ArticleLayout
      title="Free PNG to EPS Converter"
      lede="Turn PNG images into EPS vector files right in your browser. Free, no sign-up, no watermarks, and your files never leave your device."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "PNG to EPS" },
      ]}
      jsonLd={jsonLd}
    >
      <h2>What is an EPS file?</h2>
      <p>
        EPS (Encapsulated PostScript) is a vector graphics format widely used in
        print and professional graphic design. Unlike a PNG, which stores a
        fixed grid of pixels, an EPS file stores mathematical paths, so it can
        be scaled to any size, from a business card to a billboard, without
        losing sharpness.
      </p>
      <h2>When to use EPS instead of SVG</h2>
      <p>
        Both formats are vector, but EPS remains the safer choice in several
        workflows:
      </p>
      <ul>
        <li>
          <strong>Print shops and prepress.</strong> Many printers still ask
          for EPS or PDF vectors for logos and artwork.
        </li>
        <li>
          <strong>Stock vector sites.</strong> Marketplaces that sell vector
          art commonly require EPS uploads.
        </li>
        <li>
          <strong>Older design software.</strong> Legacy versions of layout and
          illustration tools handle EPS more reliably than SVG.
        </li>
      </ul>
      <p>
        If your destination is the web, an app, or a cutting machine,{" "}
        <Link href="/">SVG is usually the better pick</Link>. For print, EPS is
        still king.
      </p>
      <h2>How to convert PNG to EPS</h2>
      <ol>
        <li>
          <strong>Drop your PNG onto the converter.</strong> Open{" "}
          <Link href="/">png2svg.io</Link> and drag your PNG anywhere onto the
          page. Tracing starts automatically.
        </li>
        <li>
          <strong>Tune the vector settings.</strong> Raise the color count for
          detailed artwork or lower it for clean, simple shapes. Flat colors
          and sharp edges trace best.
        </li>
        <li>
          <strong>Download the EPS.</strong> When tracing finishes, choose the
          EPS export. You get the SVG and DXF versions too, from the same
          conversion.
        </li>
      </ol>
      <h2>Tips for a clean EPS</h2>
      <ul>
        <li>
          Start with the highest resolution PNG you have. More pixels give the
          tracer more edge detail to work with.
        </li>
        <li>
          Logos, icons, and illustrations with flat colors convert far better
          than photographs.
        </li>
        <li>
          If edges look jagged, increase the color count slightly or raise the
          detail setting and convert again. Every run is free.
        </li>
      </ul>
      <h2>PNG to EPS FAQ</h2>
      {faqs.map((faq) => (
        <div key={faq.question}>
          <h3>{faq.question}</h3>
          <p>{faq.answer}</p>
        </div>
      ))}
    </ArticleLayout>
  );
}
