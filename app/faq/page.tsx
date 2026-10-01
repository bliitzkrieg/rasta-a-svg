import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Answers about the free PNG to SVG converter: privacy, supported formats, file limits, presets, Cricut and laser cutter compatibility, and batch conversion.";

export const metadata: Metadata = {
  title: "FAQ: Free PNG to SVG Converter",
  description,
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ: Free PNG to SVG Converter",
    description,
    url: "https://png2svg.io/faq",
  },
};

const faqs = [
  {
    question: "How do I convert a PNG to SVG?",
    answer:
      "Drop your image onto the converter and PNG2SVG.IO vectorizes it automatically in your browser. Choose a preset if you want a different result, compare it against the original with the slider, then download the SVG (or EPS/DXF) with one click. No account or installation needed.",
  },
  {
    question: "Is this PNG to SVG converter free?",
    answer:
      "Yes. Converting to SVG, EPS, and DXF is free, with no watermarks and no sign-up required. The site is supported by ads.",
  },
  {
    question: "Do I need to create an account?",
    answer:
      "No. There is no sign-up, no login, and no email required. Open the page, convert, and download.",
  },
  {
    question: "Are my images uploaded to a server?",
    answer:
      "No. All vectorization runs locally in your browser using WebAssembly. Your images are never uploaded. They stay in your browser's local storage (IndexedDB) until you remove them, so your artwork stays private.",
  },
  {
    question: "Which image formats can I convert?",
    answer:
      "PNG, JPG, and WebP. PNG and WebP files with transparent backgrounds keep those areas transparent in the SVG.",
  },
  {
    question: "What formats can I export besides SVG?",
    answer:
      "Every conversion also produces EPS and DXF files, plus a Clean SVG option. Each export keeps the same layered structure, with one group of paths per color. The pixel-correction layer, which makes the Pixel-perfect SVG match the original pixel for pixel, is only in the regular SVG. Clean SVG, EPS, and DXF leave it out, since single-pixel rectangles are not useful for cutting or editing. On very large, detailed images such as photos, the correction layer may be skipped to keep the file size reasonable, and the app tells you when that happens.",
  },
  {
    question: "What do the presets do?",
    answer:
      "Pixel-perfect, the default, uses exact pixel-edge paths plus a correction layer so the SVG matches the original at its native size. Smaller file uses simplified polygon paths for a much smaller file that is not pixel-exact. Black & white produces a single-color silhouette for cut files, stencils, and vinyl. For finer control, open Advanced settings to adjust options such as color detail, speck removal, and edge style.",
  },
  {
    question: "Will the SVG work with Cricut Design Space?",
    answer:
      "Yes. The SVG imports into Cricut Design Space with one layer per color. For cutting, use the Clean SVG download: it strips the pixel-correction layer (thousands of tiny 1px rectangles that make the preview pixel-perfect but that a cutter would try to cut). For a single-color cut, the Black & white preset gives you one silhouette. Silhouette Studio imports the DXF export; importing SVG into Silhouette Studio requires Designer Edition.",
  },
  {
    question: "Is there a file size limit?",
    answer:
      "Files up to 25 MB are accepted. Images larger than 1000 pixels on the long edge are traced at 1000 pixels, and the SVG keeps the original display size, so it drops into your layout at the same dimensions.",
  },
  {
    question: "Can I convert multiple images at once?",
    answer:
      "Yes. Drop several images and they queue up for conversion. Download each result individually, or use Download all to get a ZIP with the SVG, EPS, and DXF for every image.",
  },
  {
    question: "What kind of image vectorizes best?",
    answer:
      "Flat colors, sharp edges, and high resolution: logos, icons, illustrations, line art, and text. Photos also convert, but they produce very large files, because every gradient has to be described with many small shapes. Vectorization is not meant for photos.",
  },
  {
    question: "How do I get cleaner vector results?",
    answer:
      "Start with the largest, cleanest image you have, ideally a PNG rather than a compressed JPG. Prefer artwork with flat colors and sharp edges. If the result has too many tiny shapes, try the Smaller file preset or increase speck removal under Advanced settings. For one-color designs, use Black & white.",
  },
  {
    question: "Which browsers are supported?",
    answer:
      "Current versions of Chrome, Edge, Firefox, and Safari. The converter needs WebAssembly, which all of them support.",
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

export default function FaqPage() {
  return (
    <ArticleLayout
      title="Frequently asked questions"
      lede="Everything about converting PNG, JPG, and WebP images to SVG, EPS, and DXF with PNG2SVG.IO: privacy, limits, presets, compatibility, and quality tips."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "FAQ" },
      ]}
      jsonLd={jsonLd}
    >
      {faqs.map((faq, index) => (
        <div key={faq.question}>
          <h2>{faq.question}</h2>
          <p>{faq.answer}</p>
          {index === 3 ? <AdSlot name="articleInline" minHeight={280} /> : null}
        </div>
      ))}
      <h2>Still curious how it works?</h2>
      <p>
        Read <Link href="/guides/what-is-vectorization">what vectorization is</Link> to
        understand how an image becomes vector paths, see{" "}
        <Link href="/svg-for-cricut">how to make Cricut cut files</Link>, or
        browse all the <Link href="/guides">guides</Link>. You can also jump
        straight to the <Link href="/">free converter</Link>.
      </p>
    </ArticleLayout>
  );
}
