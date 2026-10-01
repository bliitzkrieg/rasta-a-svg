import Link from "next/link";
import type { PresetId } from "@/lib/presets";
import type { ReactNode } from "react";
import ConverterApp from "./ConverterApp";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import type { ExportFormat } from "@/types/vector";
import styles from "./ArticleLayout.module.css";

export interface Crumb {
  label: string;
  href?: string;
}

export interface RelatedLink {
  href: string;
  title: string;
  description: string;
}

interface ArticleLayoutProps {
  title: string;
  lede: string;
  crumbs: Crumb[];
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  children: ReactNode;
  /** Show the "Try the free converter" box at the end. Converter pages hide it. */
  showCta?: boolean;
  /** Embed the working converter above the article (converter landing pages). */
  converter?: { defaultFormat: ExportFormat; defaultPreset?: PresetId };
  /** "Related guides" cards shown after the article. */
  related?: RelatedLink[];
}

export function ArticleLayout({
  title,
  lede,
  crumbs,
  jsonLd,
  children,
  showCta = true,
  converter,
  related,
}: ArticleLayoutProps) {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      ...(crumb.href ? { item: `https://png2svg.io${crumb.href}` } : {}),
    })),
  };
  const scripts = jsonLd
    ? [breadcrumbJsonLd, ...(Array.isArray(jsonLd) ? jsonLd : [jsonLd])]
    : [breadcrumbJsonLd];

  return (
    <>
      <SiteHeader />
      <main id="main-content" className={styles.page}>
        {scripts.map((script, index) => (
          <script
            key={index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(script) }}
          />
        ))}
        <div className={converter ? styles.introWide : styles.intro}>
          <nav aria-label="Breadcrumb" className={styles.crumbs}>
            {crumbs.map((crumb, index) => (
              <span key={crumb.label} className={styles.crumb}>
                {index > 0 ? (
                  <span aria-hidden="true" className={styles.sep}>
                    /
                  </span>
                ) : null}
                {crumb.href ? (
                  <Link href={crumb.href}>{crumb.label}</Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lede}>{lede}</p>
        </div>
        {converter ? (
          <div className={styles.tool}>
            <ConverterApp
              defaultFormat={converter.defaultFormat}
              defaultPreset={converter.defaultPreset}
              hero="compact"
            />
          </div>
        ) : null}
        <article className={styles.prose}>{children}</article>
        {related && related.length > 0 ? (
          <section className={styles.related} aria-labelledby="related-heading">
            <h2 id="related-heading" className={styles.relatedTitle}>
              Related guides
            </h2>
            <div className={styles.relatedGrid}>
              {related.map((item) => (
                <Link key={item.href} href={item.href} className={styles.relatedCard}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        {showCta ? (
          <div className={styles.cta}>
            <h2 className={styles.ctaTitle}>Try the free converter</h2>
            <p className={styles.ctaText}>
              Drop a PNG on the page and download your vector in seconds. No
              sign-up, no watermarks, nothing uploaded.
            </p>
            <Link href="/" className={styles.ctaButton}>
              Convert a PNG now
            </Link>
          </div>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
