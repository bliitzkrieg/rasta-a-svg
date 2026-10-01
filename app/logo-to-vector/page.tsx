import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { ArticleLayout } from "@/components/ArticleLayout";

const description =
  "Convert your logo to a vector for free. Turn a PNG or JPG logo into SVG and EPS files that printers accept, right in your browser. No sign-up, no uploads.";

export const metadata: Metadata = {
  title: "Convert Your Logo to a Vector",
  description,
  alternates: { canonical: "/logo-to-vector" },
  openGraph: {
    title: "Convert Your Logo to a Vector",
    description,
    url: "https://png2svg.io/logo-to-vector",
  },
};

const faqs = [
  {
    question: "My printer asked for a vector logo. Which file should I send?",
    answer:
      "Ask which format they prefer. Many print shops accept EPS or PDF, and some accept SVG. This converter exports SVG and EPS from the same conversion. If they need a PDF, open the SVG in Adobe Illustrator or Inkscape and save it as a PDF.",
  },
  {
    question: "Will the vector logo look exactly like my PNG?",
    answer:
      "With the default Pixel-perfect preset, the SVG matches the PNG pixel for pixel at its original size. When you scale it up, the edges stay sharp instead of turning blurry. Check the result with the compare slider before you send it anywhere.",
  },
  {
    question: "Can I edit the colors of my logo after converting?",
    answer:
      "Yes. Each color becomes its own group of paths, so in a vector editor you can select one color group and change it. Use the Clean SVG download for editing, since it leaves out the pixel-correction layer.",
  },
  {
    question: "Is it safe to convert a client's logo here?",
    answer:
      "Conversion runs entirely in your browser with WebAssembly, and the image is never uploaded to a server. Files stay in your browser's local storage until you remove them.",
  },
];

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Convert Your Logo to a Vector",
    url: "https://png2svg.io/logo-to-vector",
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

export default function LogoToVectorPage() {
  return (
    <ArticleLayout
      title="Convert Your Logo to a Vector"
      lede="Only have your logo as a PNG or JPG? Convert it below into SVG and EPS vector files you can send to a printer, sign maker, or embroidery shop. Free, and nothing is uploaded."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Logo to vector" },
      ]}
      jsonLd={jsonLd}
      converter={{ defaultFormat: "svg" }}
      showCta={false}
      related={[
        {
          href: "/png-to-eps",
          title: "PNG to EPS converter",
          description: "EPS files for print shops, stock sites, and older design software.",
        },
        {
          href: "/guides/png-vs-svg",
          title: "PNG vs SVG",
          description: "Why a vector logo stays sharp at any size and a PNG does not.",
        },
        {
          href: "/jpg-to-svg",
          title: "JPG to SVG converter",
          description: "Tips for tracing a logo that only exists as a compressed JPG.",
        },
      ]}
    >
      <h2>Why printers ask for a vector logo</h2>
      <p>
        A PNG logo is a fixed grid of pixels. It looks fine on a website at
        the size it was exported, but print work usually needs it much larger
        or at a much higher resolution. A 500 pixel logo stretched across a
        banner, a vehicle wrap, or even a crisp business card turns soft and
        jagged, because there is no extra detail to fill in.
      </p>
      <p>
        A vector logo stores shapes instead of pixels. The printer can scale it
        to any size and it stays sharp. Vectors also make a printer&apos;s job
        easier in other ways:
      </p>
      <ul>
        <li>
          <strong>Clean edges at any size.</strong> Business cards, signs, and
          large banners all come from the same file.
        </li>
        <li>
          <strong>Separate colors.</strong> Each color is a distinct shape,
          which matters for screen printing, vinyl signs, and spot-color jobs.
        </li>
        <li>
          <strong>Cutting and engraving.</strong> Sign makers and engravers
          need outlines to follow. A pixel image does not have any.
        </li>
      </ul>
      <p>
        If the original design files were lost, or a previous designer only
        handed over a PNG, converting the image is the quickest way to get a
        usable vector back.
      </p>

      <h2>SVG, EPS, or PDF for print?</h2>
      <p>
        All three can hold vector artwork. Which one you need depends on who
        is receiving the file.
      </p>
      <table>
        <thead>
          <tr>
            <th>Format</th>
            <th>Common uses</th>
            <th>How to get it here</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>SVG</td>
            <td>Websites, apps, cutting machines, modern design tools</td>
            <td>Download directly</td>
          </tr>
          <tr>
            <td>EPS</td>
            <td>Print shops, promotional product suppliers, stock sites</td>
            <td>Download directly</td>
          </tr>
          <tr>
            <td>PDF</td>
            <td>Print shops and anyone who just needs to view the file</td>
            <td>Open the SVG in Illustrator or Inkscape and save as PDF</td>
          </tr>
        </tbody>
      </table>
      <p>
        The converter exports SVG and{" "}
        <Link href="/png-to-eps">EPS</Link> from the same conversion, so you
        can send whichever the printer requests. When a printer asks for a
        PDF, open the SVG in Adobe Illustrator or Inkscape and save or export
        it as a PDF. The paths stay vector the whole way through. When in
        doubt, ask the printer which format they prefer. It saves a round of
        back-and-forth.
      </p>

      <AdSlot name="articleInline" minHeight={280} />

      <h2>How to convert your logo</h2>
      <ol>
        <li>
          <strong>Find the largest copy of the logo.</strong> Check email
          attachments, old website files, and social media headers. The biggest
          and least compressed version gives the cleanest result. A PNG with
          a transparent background is ideal.
        </li>
        <li>
          <strong>Drop it onto the converter above.</strong> PNG, JPG, and WebP
          files up to 25 MB work. Tracing starts in your browser right away.
        </li>
        <li>
          <strong>Keep the Pixel-perfect preset for print.</strong> It is the
          default. The SVG traces exact pixel edges and adds a correction layer
          so the result matches your original at its native size.
        </li>
        <li>
          <strong>Check the result.</strong> Drag the compare slider across
          the preview and look closely at edges, small text, and thin lines.
          The zoom buttons under the preview go up to 400%, and the
          background switch shows how transparent areas look on white or
          black.
        </li>
        <li>
          <strong>Download SVG and EPS.</strong> Keep both. Use Clean SVG if
          you plan to edit the paths in a vector editor.
        </li>
      </ol>

      <h2>Check the result before you send it</h2>
      <p>
        A traced logo is only as good as what you catch before it goes to
        print. Spend a minute with the compare view:
      </p>
      <ul>
        <li>
          <strong>Look closely at curves.</strong> Round letters and circles show
          tracing problems first. Look for flat spots or wobbles.
        </li>
        <li>
          <strong>Check small text.</strong> Taglines and registration marks
          are often only a few pixels tall in the original. If they look rough,
          you need a larger source image.
        </li>
        <li>
          <strong>Look at color boundaries.</strong> Where two colors meet,
          the shapes should sit cleanly against each other with no stray
          slivers.
        </li>
        <li>
          <strong>Open the SVG on its own.</strong> Open the downloaded file in
          a browser tab or vector editor and zoom far in. Vector edges stay
          crisp at any zoom level. With the Pixel-perfect preset they follow
          the original pixel grid exactly, so a small source shows its pixel
          steps when enlarged a lot; a larger source gives smoother edges.
        </li>
      </ul>
      <p>
        If the result looks rough, the source is usually the cause. Try a
        larger or cleaner copy of the logo before anything else. For logos
        that only exist as JPG, the{" "}
        <Link href="/jpg-to-svg">JPG to SVG guide</Link> covers how to deal
        with compression noise.
      </p>

      <h2>Keep the original PNG</h2>
      <p>
        Do not throw away the PNG once you have a vector. Keep the largest
        copy you found alongside the SVG and EPS. If a printer reports a
        problem, or you need to convert again with a different preset, you
        will want the best source on hand. Images larger than 1000 px on the
        long edge are traced at 1000 px and the SVG keeps the original display
        size, so a larger original still gives the tracer the best possible
        starting point.
      </p>
      <p>
        One honest limit: tracing reproduces the logo as it appears in the
        image. It does not recreate the original fonts or the designer&apos;s
        construction lines. For a logo that will be used for years across
        many products, a vector file is worth having either way, and
        a converted version is a solid place to start.
      </p>

      <h2>Logo to vector FAQ</h2>
      {faqs.map((faq) => (
        <div key={faq.question}>
          <h3>{faq.question}</h3>
          <p>{faq.answer}</p>
        </div>
      ))}
    </ArticleLayout>
  );
}
