import type { Metadata } from "next";
import { AdSlot } from "@/components/AdSlot";
import ConverterApp from "@/components/ConverterApp";
import { HomeSections } from "@/components/HomeSections";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import styles from "./home.module.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className={styles.home}>
        <div className={styles.tool}>
          <ConverterApp />
        </div>
        <div className={styles.adBand}>
          <AdSlot name="homeBelowTool" minHeight={116} />
        </div>
        <HomeSections />
      </main>
      <SiteFooter />
    </>
  );
}
