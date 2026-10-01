import Link from "next/link";
import { Logo } from "./Logo";
import { FOOTER_COLUMNS } from "@/lib/siteNav";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <Link href="/" className={styles.brand} aria-label="png2svg.io home">
            <Logo className={styles.logo} />
          </Link>
          <p className={styles.tagline}>
            Free, private PNG to SVG converter. Files never leave your browser.
          </p>
          <p className={styles.copyright}>
            © {new Date().getFullYear()} PNG2SVG.IO
          </p>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.title} className={styles.column} aria-label={column.title}>
            <h2 className={styles.columnTitle}>{column.title}</h2>
            <ul className={styles.links}>
              {column.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
