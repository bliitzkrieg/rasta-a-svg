import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";
import { CONTACT_EMAIL } from "@/lib/siteNav";

export const metadata: Metadata = {
  title: "About",
  description:
    "PNG2SVG.IO is a free, private image to vector converter that runs in your browser. Learn why it exists, how it stays free, and how it keeps your files private.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About PNG2SVG.IO",
    description:
      "A free, private image to vector converter that runs in your browser. Why it exists and how it stays free.",
    url: "https://png2svg.io/about",
  },
};

export default function AboutPage() {
  return (
    <ArticleLayout
      title="About PNG2SVG.IO"
      lede="A free, private converter that turns PNG, JPG and WebP images into layered vector files, right in your browser."
      crumbs={[{ label: "Home", href: "/" }, { label: "About" }]}
    >
      <h2>Why it exists</h2>
      <p>
        Most online vectorizers make you upload your artwork, create an
        account, or pay to remove a watermark. PNG2SVG.IO does none of that.
        You drop an image on the page and download an SVG, EPS or DXF file a
        few seconds later.
      </p>

      <h2>Private by design</h2>
      <p>
        The converter is compiled to WebAssembly and runs entirely on your
        device. Your images are never sent to a server, which also means the
        converter works the same whether your file is a doodle or an
        unreleased brand logo. The <Link href="/privacy">Privacy Policy</Link>{" "}
        has the details.
      </p>

      <h2>Accurate by default</h2>
      <p>
        The default Pixel-perfect preset traces exact pixel edges and adds a
        correction layer for anti-aliased edge pixels, so at its original size
        the SVG matches your image pixel for pixel. When you want a smaller or
        simpler file, the Smaller file and Black &amp; white presets trade a
        little exactness for size or for cut-friendly shapes.
      </p>

      <h2>How it stays free</h2>
      <p>
        The site is supported by ads. There are no paid tiers, file limits
        beyond 25 MB per image, or watermarks.
      </p>

      <h2>Get in touch</h2>
      <p>
        Found a bug, have an image that converts badly, or want to suggest a
        feature? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </ArticleLayout>
  );
}
