import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "What changed on PNG2SVG.IO and when: converter improvements, new export formats, new guides, and site maintenance. The converter and the site are actively maintained.";

export const metadata: Metadata = {
  title: "Changelog",
  description,
  alternates: { canonical: "/changelog" },
  openGraph: {
    title: "Changelog | PNG2SVG.IO",
    description,
    url: "https://png2svg.io/changelog",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Changelog | PNG2SVG.IO",
  url: "https://png2svg.io/changelog",
  description,
};

export default function ChangelogPage() {
  return (
    <ArticleLayout
      title="Changelog"
      lede="What changed on PNG2SVG.IO and when. The converter and the site are maintained in the open, and this page is updated with every release."
      updated="October 28, 2026"
      crumbs={[{ label: "Home", href: "/" }, { label: "Changelog" }]}
      jsonLd={jsonLd}
      related={[
        {
          href: "/about",
          title: "About PNG2SVG.IO",
          description: "Why the converter exists, how it stays private, and how it stays free.",
        },
        {
          href: "/guides",
          title: "All guides",
          description: "Practical guides to converting images into vectors.",
        },
      ]}
    >
      <h2>October 28, 2026</h2>
      <ul>
        <li>
          PNG to DXF page rewritten: what the DXF export contains, how to
          size it for laser and CNC work, and new FAQ entries on units and
          layers.
        </li>
        <li>
          Two new guides:{" "}
          <Link href="/guides/why-is-my-svg-file-so-big">
            why SVG files get big and how to shrink them
          </Link>
          , and{" "}
          <Link href="/guides/transparent-png-to-svg">
            keeping transparency when converting a PNG to SVG
          </Link>
          .
        </li>
        <li>
          Search engine housekeeping: example artwork and the old service
          worker script are now marked noindex, so they stop appearing as
          empty pages in search results.
        </li>
        <li>This changelog page, so maintenance is visible instead of assumed.</li>
      </ul>

      <h2>September 30, 2026</h2>
      <ul>
        <li>
          Cricut cut file mode: a preset that traces flat colors with smooth
          outlines, no background, and one layer per color, sized in inches
          for cutting machines.
        </li>
        <li>
          Near-opaque alpha fix: pixels that are almost but not quite opaque
          no longer trace as stray shapes.
        </li>
        <li>
          Design overhaul across the site: new hero, converter workspace,
          shared header and footer, SEO landing pages, legal pages, and ad
          placements.
        </li>
        <li>New logo, share image, and a faster draggable compare gallery.</li>
      </ul>

      <h2>September 27–29, 2026</h2>
      <ul>
        <li>
          Pixel-perfect preset: traces exact pixel edges and adds a correction
          layer for anti-aliased edge pixels, so the SVG matches the original
          image pixel for pixel at its native size.
        </li>
        <li>
          Transparency fixes in the tracer, including correct handling of
          transparent backgrounds instead of painting them in.
        </li>
        <li>
          EPS and DXF exports moved into the converter worker, so every
          conversion offers all three formats.
        </li>
        <li>
          A run of accuracy fixes from an independent review pass: color path
          residuals, polygon paths, preview honesty, and export errors.
        </li>
      </ul>

      <h2>September 26, 2026</h2>
      <ul>
        <li>
          PNG2SVG.IO launches: a free PNG to SVG converter that runs entirely
          in the browser, with no uploads, no sign-up, and no watermarks.
        </li>
      </ul>

      <h2>Questions or a bad conversion?</h2>
      <p>
        Found a bug, have an image that converts badly, or want a feature?
        Email <a href="mailto:hello@png2svg.io">hello@png2svg.io</a>. Reports
        with the source image attached are the fastest way to get a fix into a
        release.
      </p>
    </ArticleLayout>
  );
}
