import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Convert PNG to EPS free in your browser. Vectorize PNG images into scalable EPS files for print and design. No sign-up, no watermarks, nothing uploaded.";

export const metadata: Metadata = {
  title: "Free PNG to EPS Converter",
  description,
  alternates: { canonical: "/png-to-eps" },
  openGraph: {
    title: "Free PNG to EPS Converter",
    description,
    url: "https://png2svg.io/png-to-eps",
  },
};

const faqs = [
  {
    question: "Is converting PNG to EPS free?",
    answer:
      "Yes. PNG to EPS conversion on PNG2SVG.IO is free, with no watermarks and no sign-up required. The site is supported by ads.",
  },
  {
    question: "Will the EPS file work with Adobe Illustrator?",
    answer:
      "Yes. The EPS export contains standard vector paths that import into Adobe Illustrator, CorelDRAW, Inkscape, and other vector design software.",
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
      converter={{ defaultFormat: "eps" }}
      showCta={false}
      related={[
        {
          href: "/logo-to-vector",
          title: "Convert your logo to a vector",
          description: "Get SVG and EPS versions of a logo that printers will accept.",
        },
        {
          href: "/png-to-dxf",
          title: "PNG to DXF converter",
          description: "DXF files for laser cutters, CNC machines, and CAD software.",
        },
        {
          href: "/guides/png-vs-svg",
          title: "PNG vs SVG",
          description: "Raster pixels versus vector paths, and when to use each.",
        },
      ]}
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
          for EPS or PDF vectors for logos and artwork. Our guide to{" "}
          <Link href="/logo-to-vector">converting a logo to a vector</Link>{" "}
          covers what to send.
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

      <AdSlot name="articleInline" minHeight={280} />

      <h2>How to convert PNG to EPS</h2>
      <ol>
        <li>
          <strong>Drop your PNG onto the converter.</strong> The converter is
          right at the top of this page. Drag your PNG onto it or pick a file.
          JPG and WebP work too. Tracing starts automatically.
        </li>
        <li>
          <strong>Keep the Pixel-perfect preset for print.</strong> It is the
          default and traces exact pixel edges, so the shapes match your
          original artwork. Drag the compare slider over the preview to check
          edges against the PNG.
        </li>
        <li>
          <strong>Download the EPS.</strong> When tracing finishes, choose the
          EPS export. You get the SVG and{" "}
          <Link href="/png-to-dxf">DXF</Link> versions too, from the same
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
          The EPS export never includes the pixel-correction layer that the
          Pixel-perfect SVG uses, so it contains only the traced shapes, one
          group per color.
        </li>
        <li>
          If the EPS is heavier than you need, try the Smaller file preset. It
          uses simplified paths and produces a much smaller file, at the cost
          of exact pixel matching. Every run is free.
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
