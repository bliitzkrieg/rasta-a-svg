import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Learn how to convert a PNG to SVG in three steps: drop your image, choose a preset and compare, then download. Free, no sign-up, and it runs in your browser.";

export const metadata: Metadata = {
  title: "How to Convert PNG to SVG in 3 Steps",
  description,
  alternates: { canonical: "/guides/how-to-convert-png-to-svg" },
  openGraph: {
    title: "How to Convert PNG to SVG in 3 Steps",
    description,
    url: "https://png2svg.io/guides/how-to-convert-png-to-svg",
  },
};

const steps = [
  {
    name: "Drop your PNG onto the converter",
    text: "Open png2svg.io and drag your PNG anywhere onto the page, or use the file picker. JPG and WebP work too. Tracing starts automatically in your browser. Nothing is uploaded.",
  },
  {
    name: "Choose a preset and compare",
    text: "Pixel-perfect is the default and matches the original pixel for pixel. Smaller file gives a much lighter, simplified SVG. Black & white makes a single-color silhouette for cut files. Drag the compare slider to check the result against your PNG.",
  },
  {
    name: "Download your vector file",
    text: "Choose SVG, Clean SVG, EPS, or DXF and download with one click. Converting several PNGs? They queue up, and Download all gives you a ZIP with every format.",
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
    description,
  },
];

export default function HowToConvertPage() {
  return (
    <ArticleLayout
      title="How to convert PNG to SVG"
      lede="Converting a PNG to SVG takes three steps and under a minute. Everything happens in your browser: no uploads, no accounts, no watermarks."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Guides", href: "/guides" },
        { label: "How to convert PNG to SVG" },
      ]}
      jsonLd={jsonLd}
      related={[
        {
          href: "/guides/png-vs-svg",
          title: "PNG vs SVG",
          description: "Raster pixels versus vector paths, and when to use each.",
        },
        {
          href: "/svg-for-cricut",
          title: "Make SVG files for Cricut",
          description: "Turn a PNG into a layered cut file for Cricut Design Space.",
        },
        {
          href: "/image-to-svg",
          title: "Convert any image to SVG",
          description: "PNG, JPG, and WebP compared as inputs for vectorization.",
        },
      ]}
    >
      <h2>The three steps</h2>
      <ol>
        {steps.map((step) => (
          <li key={step.name}>
            <strong>{step.name}.</strong> {step.text}
          </li>
        ))}
      </ol>
      <h2>Choosing the right preset</h2>
      <p>
        The settings panel has three presets, and the right one depends on
        where the SVG is going.
      </p>
      <ul>
        <li>
          <strong>Pixel-perfect</strong> is the default. It traces exact pixel
          edges and adds a correction layer of tiny rectangles for the
          anti-aliased pixels along each edge, so at its original size the SVG
          matches the PNG pixel for pixel. Use it for display, print, and
          anything where fidelity matters most.
        </li>
        <li>
          <strong>Smaller file</strong> uses simplified polygon paths. The file
          is much smaller and easier to edit, but no longer pixel-exact. Pick
          it for web graphics or when the Pixel-perfect file is heavier than
          you need.
        </li>
        <li>
          <strong>Black & white</strong> turns the image into a single-color
          silhouette. It is the quickest route to stencils, vinyl decals, and
          other cut files.
        </li>
      </ul>
      <p>
        After switching presets, drag the compare slider across the preview to
        see the vector against your original. If you need finer control,
        Advanced settings lets you adjust options such as color detail, speck
        removal, and edge style. Every conversion is free, so try a couple of
        options and keep the one you like.
      </p>

      <AdSlot name="articleInline" minHeight={280} />

      <h2>What to do with your SVG</h2>
      <p>
        The SVG opens in any browser and imports into Adobe Illustrator,
        Inkscape, and CorelDRAW. It also imports into{" "}
        <Link href="/svg-for-cricut">Cricut Design Space</Link> for cutting;
        use the Clean SVG download there so the machine does not try to cut
        the pixel-correction rectangles. Need a different format? Every
        conversion also exports <Link href="/png-to-eps">EPS</Link> for print
        workflows and <Link href="/png-to-dxf">DXF</Link> for laser cutters and
        CAD software.
      </p>
      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Starting with a tiny PNG.</strong> A 200 pixel thumbnail has
          almost no edge detail to trace. Use the largest source you have.
        </li>
        <li>
          <strong>Vectorizing a photo and expecting a small file.</strong>{" "}
          Photos have gradients and texture everywhere, and describing them
          with shapes produces very large SVGs. Vectorization is meant for
          logos, icons, illustrations, and line art. Keep photos as PNG or JPG.
        </li>
        <li>
          <strong>Sending the full SVG to a cutting machine.</strong> The
          Pixel-perfect SVG includes thousands of tiny correction rectangles.
          Download Clean SVG, EPS, or DXF for cutting instead, since none of
          them include that layer.
        </li>
        <li>
          <strong>Skipping the comparison.</strong> Check edges and small text
          with the compare slider before downloading, then try another preset
          if needed.
        </li>
      </ul>
    </ArticleLayout>
  );
}
