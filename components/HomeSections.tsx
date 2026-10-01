import Link from "next/link";
import {
  ArrowRight,
  Download,
  Files,
  FileType,
  Layers,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Upload,
} from "lucide-react";
import { MiniCompare } from "./MiniCompare";
import styles from "./HomeSections.module.css";

const GALLERY = [
  {
    name: "logo",
    title: "Logo",
    description: "A round badge with clean edges and four flat colors.",
    alt: "Fox badge logo",
    width: 640,
    height: 640,
  },
  {
    name: "icon",
    title: "App icon",
    description: "Rounded square, soft anti-aliased curves, transparent corners.",
    alt: "Rocket app icon",
    width: 640,
    height: 640,
  },
  {
    name: "illustration",
    title: "Illustration",
    description: "Layered landscape with eight colors and sharp diagonals.",
    alt: "Flat mountain landscape illustration",
    width: 640,
    height: 640,
  },
];

const STEPS = [
  {
    icon: Upload,
    title: "Drop in an image",
    text: "Drag PNG, JPG or WebP files anywhere on the page. They queue up and convert one after another.",
  },
  {
    icon: SlidersHorizontal,
    title: "Pick a preset",
    text: "Pixel-perfect is the default. Choose Smaller file or Black & white, then compare the original and the vector side by side.",
  },
  {
    icon: Download,
    title: "Download your vector",
    text: "Get SVG, EPS or DXF. Each color is its own layer, ready for cutting machines, print, or the web.",
  },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Private by design",
    text: "Conversion runs on your device. Nothing is uploaded, ever.",
  },
  {
    icon: Target,
    title: "Pixel-perfect output",
    text: "At its original size, the SVG matches your image pixel for pixel.",
  },
  {
    icon: Layers,
    title: "Layered by color",
    text: "Every color is its own layer, ready for Cricut, Silhouette, and laser software.",
  },
  {
    icon: Files,
    title: "Batch conversion",
    text: "Drop a whole folder of images and download everything as a ZIP.",
  },
  {
    icon: FileType,
    title: "SVG, EPS and DXF",
    text: "Get all three formats from a single conversion.",
  },
  {
    icon: Scissors,
    title: "Clean files for cutting",
    text: "Cricut mode: a few flat colors, smooth outlines, no background, one layer per color.",
  },
];

const WORKFLOWS = [
  {
    href: "/svg-for-cricut",
    title: "Cricut & Silhouette",
    text: "Layered SVGs that import straight into Design Space.",
  },
  {
    href: "/png-to-dxf",
    title: "Laser cutting & CNC",
    text: "DXF paths for LightBurn, CAD and CAM software.",
  },
  {
    href: "/png-to-eps",
    title: "Print & logos",
    text: "EPS and SVG files your print shop will accept.",
  },
  {
    href: "/guides/png-vs-svg",
    title: "Web & apps",
    text: "Sharp, scalable SVG icons and illustrations.",
  },
];

const FAQS = [
  {
    question: "Is it really free?",
    answer:
      "Yes. Converting is free with no sign-up and no watermark. The site is supported by ads.",
  },
  {
    question: "Are my images uploaded anywhere?",
    answer:
      "No. Vectorization runs in your browser with WebAssembly, so your files never leave your device.",
  },
  {
    question: "Will the SVG work in Cricut Design Space?",
    answer:
      "Yes. Choose the Cricut cut file preset: each color comes in as one layer with smooth outlines, the background is removed, and the file is sized in inches to fit your mat.",
  },
  {
    question: "Which formats can I download?",
    answer:
      "Every conversion gives you SVG, EPS and DXF. Pick one from the download menu, or download all of them as a ZIP.",
  },
  {
    question: "What images work best?",
    answer:
      "Logos, icons, illustrations, line art and text with flat colors. Photos work, but they create very large files with thousands of shapes.",
  },
];

export function HomeSections() {
  return (
    <div className={styles.sections}>
      <section className={styles.section} aria-labelledby="gallery-heading">
        <header className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Real conversions</span>
          <h2 id="gallery-heading" className={styles.heading}>
            See the difference
          </h2>
          <p className={styles.lede}>
            Drag across each image. The right side is the SVG this converter produced,
            layered and pixel-exact.
          </p>
        </header>
        <div className={styles.gallery}>
          {GALLERY.map((item) => (
            <article key={item.name} className={styles.galleryCard}>
              <MiniCompare
                pngSrc={`/examples/${item.name}.png`}
                svgSrc={`/examples/${item.name}.svg`}
                alt={item.alt}
                width={item.width}
                height={item.height}
              />
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="how-heading">
        <header className={styles.sectionHeader}>
          <span className={styles.eyebrow}>How it works</span>
          <h2 id="how-heading" className={styles.heading}>
            From pixels to paths in three steps
          </h2>
          <p className={styles.lede}>
            No uploads and no accounts. Everything happens in your browser.
          </p>
        </header>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.card}>
              <span className={styles.stepIcon} aria-hidden="true">
                <step.icon size={20} strokeWidth={2.2} />
              </span>
              <span className={styles.stepNumber}>Step {index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="why-heading">
        <header className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Why PNG2SVG.IO</span>
          <h2 id="why-heading" className={styles.heading}>
            Everything you need, nothing you don&apos;t
          </h2>
        </header>
        <div className={styles.features}>
          {FEATURES.map((feature) => (
            <div key={feature.title} className={styles.feature}>
              <feature.icon size={24} strokeWidth={2} className={styles.featureIcon} aria-hidden="true" />
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="workflow-heading">
        <header className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Use cases</span>
          <h2 id="workflow-heading" className={styles.heading}>
            Made for your workflow
          </h2>
        </header>
        <div className={styles.workflows}>
          {WORKFLOWS.map((item) => (
            <Link key={item.href} href={item.href} className={styles.workflowCard}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              <span className={styles.workflowLink}>
                Learn more <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-heading">
        <header className={styles.sectionHeader}>
          <span className={styles.eyebrow}>FAQ</span>
          <h2 id="faq-heading" className={styles.heading}>
            Quick answers
          </h2>
        </header>
        <div className={styles.faqList}>
          {FAQS.map((faq) => (
            <details key={faq.question} className={styles.faqItem}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
        <p className={styles.faqMore}>
          <Link href="/faq">
            More questions? Read the full FAQ <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
          </Link>
        </p>
      </section>
    </div>
  );
}
