import type { Metadata } from "next";
import { AdSlot } from "@/components/AdSlot";
import ConverterApp from "@/components/ConverterApp";
import { HomeSections } from "@/components/HomeSections";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import styles from "./home.module.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  title: {
    absolute:
      "PNG2SVG.IO: Free PNG to SVG Converter, Pixel-Perfect, No Upload",
  },
  description:
    "PNG2SVG.IO converts PNG to SVG free in your browser. Pixel-perfect layered vectors, plus EPS and DXF export. No upload, no sign-up.",
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
