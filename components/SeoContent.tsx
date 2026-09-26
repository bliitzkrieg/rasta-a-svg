import styles from "./SeoContent.module.css";

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
    question: "Will the SVG work with Cricut Design Space?",
    answer:
      "Yes. The SVG exports use clean layered paths, one layer per color, which import directly into Cricut Design Space, Silhouette Studio (via the DXF export), and most laser cutter software.",
  },
  {
    question: "Are my images uploaded to a server?",
    answer:
      "No. All vectorization runs locally in your browser using WebAssembly. Your PNG files never leave your device, so your artwork stays private.",
  },
  {
    question: "What formats can I export besides SVG?",
    answer:
      "Every conversion also produces EPS and DXF files. Each export keeps the same layered structure, with one vector layer per quantized color.",
  },
  {
    question: "How do I get cleaner vector results?",
    answer:
      "Start with the highest resolution PNG you have, and prefer artwork with flat colors and sharp edges over photos. Then raise the color count for detail, or lower it for simpler, smoother shapes.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export function SeoContent() {
  return (
    <section className={styles.seo} aria-label="About PNG2SVG.IO">
      <div className={styles.howItWorks}>
        <h2 className={styles.heading}>How it works</h2>
        <p className={styles.lede}>
          PNG2SVG.IO turns your PNG images into crisp vector files without
          uploading anything. Everything happens in your browser.
        </p>
        <ol className={styles.steps}>
          <li className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              1
            </span>
            <h3>Drop in a PNG</h3>
            <p>
              Drag and drop one or more PNG files anywhere on the page. Files
              queue up and convert one after another.
            </p>
          </li>
          <li className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              2
            </span>
            <h3>Tune the vector output</h3>
            <p>
              Adjust colors, detail, and smoothing, then compare the original
              and the vector with the before/after slider.
            </p>
          </li>
          <li className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              3
            </span>
            <h3>Download your vectors</h3>
            <p>
              Export SVG, EPS, or DXF. Each color becomes its own layer, ready
              for cutting machines, laser cutters, or print.
            </p>
          </li>
        </ol>
      </div>

      <div className={styles.faq}>
        <h2 className={styles.heading}>Frequently asked questions</h2>
        <dl className={styles.faqList}>
          {faqs.map((faq) => (
            <div className={styles.faqItem} key={faq.question}>
              <dt>
                <h3>{faq.question}</h3>
              </dt>
              <dd>
                <p>{faq.answer}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </section>
  );
}
