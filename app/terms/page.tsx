import type { Metadata } from "next";
import Link from "next/link";
import { ArticleLayout } from "@/components/ArticleLayout";
import { CONTACT_EMAIL } from "@/lib/siteNav";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "The terms for using PNG2SVG.IO, the free in-browser image to vector converter: your files stay yours, use it responsibly, and it comes with no warranty.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Use",
    description:
      "The terms for using PNG2SVG.IO: your files stay yours, use it responsibly, and it comes with no warranty.",
    url: "https://png2svg.io/terms",
  },
};

const LAST_UPDATED = "September 30, 2026";

export default function TermsPage() {
  return (
    <ArticleLayout
      title="Terms of Use"
      lede={`Last updated ${LAST_UPDATED}. By using PNG2SVG.IO you agree to these terms. They're short, so please read them.`}
      crumbs={[{ label: "Home", href: "/" }, { label: "Terms of Use" }]}
      showCta={false}
    >
      <h2>Using the service</h2>
      <p>
        PNG2SVG.IO is a free tool that converts raster images (PNG, JPG and
        WebP) into vector files (SVG, EPS and DXF). It runs in your browser,
        and you can use it for personal and commercial projects without an
        account.
      </p>

      <h2>Your files stay yours</h2>
      <p>
        You keep all rights to the images you convert and to the files the
        converter produces. Because conversion happens on your device, we never
        receive your images. See the <Link href="/privacy">Privacy Policy</Link>{" "}
        for details.
      </p>

      <h2>Use it responsibly</h2>
      <ul>
        <li>Only convert images you own or have permission to use.</li>
        <li>
          Don&apos;t use the service for anything illegal, or to infringe
          anyone&apos;s copyright, trademark or other rights.
        </li>
        <li>
          Don&apos;t try to disrupt the site, overload it with automated
          traffic, or interfere with its ads.
        </li>
      </ul>

      <h2>No warranty</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo;, without warranties of any kind. We work hard on
        accuracy, but we don&apos;t guarantee that every conversion will be
        perfect, fit a particular purpose, or be available at all times. Always
        check output files before using them for printing, cutting or
        manufacturing, and do a test run on scrap material.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, PNG2SVG.IO and its operators
        are not liable for any indirect, incidental or consequential damages,
        or for any loss of data, materials or profits, arising from your use
        of the service.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms or the service from time to time. If you keep
        using the site after a change, the updated terms apply.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </ArticleLayout>
  );
}
