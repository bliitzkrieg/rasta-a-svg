import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className={styles.page}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>This page doesn&apos;t exist</h1>
        <p className={styles.text}>
          The link may be old or mistyped. The converter is one click away.
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.primary}>
            Convert an image
          </Link>
          <Link href="/guides" className={styles.secondary}>
            Browse guides
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
