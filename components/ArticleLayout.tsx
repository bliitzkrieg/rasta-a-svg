import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./ArticleLayout.module.css";

export interface Crumb {
  label: string;
  href?: string;
}

interface ArticleLayoutProps {
  title: string;
  lede: string;
  crumbs: Crumb[];
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  children: ReactNode;
}

export function ArticleLayout({
  title,
  lede,
  crumbs,
  jsonLd,
  children,
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
    <main className={styles.article}>
      {scripts.map((script, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(script) }}
        />
      ))}
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
      <div className={styles.prose}>{children}</div>
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
    </main>
  );
}
