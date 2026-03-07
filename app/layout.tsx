import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "png2svg.io",
  description: "Client-side PNG to SVG/EPS/DXF converter with layered exports.",
};

export const viewport: Viewport = {
  themeColor: "#2281B3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.className} ${manrope.variable}`}>
        {children}
      </body>
    </html>
  );
}
