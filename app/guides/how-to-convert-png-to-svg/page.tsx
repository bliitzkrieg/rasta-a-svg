import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

export const metadata: Metadata = {
  title: "How to Convert PNG to SVG in 3 Steps | PNG2SVG.IO",
  description:
    "Learn how to convert a PNG to SVG: drop your image, tune the vector settings, and download. Free, no sign-up, works entirely in your browser.",
  alternates: { canonical: "/guides/how-to-convert-png-to-svg" },
};

const steps = [
  {
    name: "Drop your PNG onto the converter",
    text: "Open png2svg.io and drag your PNG anywhere onto the page, or use the file picker. Tracing starts automatically in your browser. Nothing is uploaded.",
  },
  {
    name: "Tune the vector settings",
    text: "Adjust the color count, detail, and smoothing to taste. More colors keep fine detail, fewer colors give clean simple shapes. Preview the result before downloading.",
  },
  {
    name: "Download your vector file",
    text: "Choose SVG, EPS, or DXF and download with one click. Converting several PNGs? They queue up, and you can download everything as a ZIP.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to Convert PNG to SVG",
    description:
      "Convert a PNG image to a vector SVG file in three steps using the free PNG2SVG.IO converter.",
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  },
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "How to Convert PNG to SVG in 3 Steps",
    url: "https://png2svg.io/guides/how-to-convert-png-to-svg",
    description:
      "Learn how to convert a PNG to SVG: drop your image, tune the vector settings, and download.",
  },
];

export default function HowToConvertPage() {
  return (
    <ArticleLayout
      title="How to convert PNG to SVG"
      lede="Converting a PNG to SVG takes three steps and under a minute. Everything happens in your browser: no uploads, no accounts, no watermarks."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Guides", href: "/guides/how-to-convert-png-to-svg" },
        { label: "How to convert PNG to SVG" },
      ]}
      jsonLd={jsonLd}
    >
      <h2>The three steps</h2>
      <ol>
        {steps.map((step) => (
          <li key={step.name}>
            <strong>{step.name}.</strong> {step.text}
          </li>
        ))}
      </ol>
      <h2>Choosing the right settings</h2>
      <p>
        The two settings that matter most are <strong>color count</strong> and{" "}
        <strong>detail</strong>. A logo with three flat colors needs only a
        handful of colors to trace perfectly. An illustration with soft shading
        needs more colors to keep its gradients from banding into flat blobs.
        When in doubt, convert twice with different settings and keep the
        better result. Every conversion is free.
      </p>
      <h2>What to do with your SVG</h2>
      <p>
        The SVG opens in browsers, Illustrator, Inkscape, and Figma, and
        imports into Cricut Design Space for cutting. Need a different format?
        Every conversion also exports <Link href="/png-to-eps">EPS</Link> for
        print workflows and <Link href="/png-to-dxf">DXF</Link> for laser
        cutters and CAD software.
      </p>
      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Starting with a tiny PNG.</strong> A 200 pixel thumbnail has
          almost no edge detail to trace. Use the largest source you have.
        </li>
        <li>
          <strong>Vectorizing a photo and expecting a photo.</strong> Photos
          come out stylized and posterized. That is normal: vectorization
          reduces gradients to flat shapes. For photos, raise the color count.
        </li>
        <li>
          <strong>Ignoring the preview.</strong> Check edges and small text in
          the preview before downloading, then adjust and re-run if needed.
        </li>
      </ul>
    </ArticleLayout>
  );
}
