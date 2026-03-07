import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://png2svg.io"),
  title: {
    default: "PNG2SVG.IO",
    template: "%s | PNG2SVG.IO",
  },
  description:
    "Convert PNG artwork into clean SVG, EPS, and DXF exports directly in your browser with layered vector output.",
  applicationName: "PNG2SVG.IO",
  keywords: [
    "png to svg",
    "svg converter",
    "eps export",
    "dxf export",
    "vector converter",
    "image to vector",
    "client-side converter",
  ],
  authors: [
    {
      name: "Bliitzkrieg",
      url: "https://github.com/bliitzkrieg",
    },
  ],
  creator: "Bliitzkrieg",
  publisher: "PNG2SVG.IO",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/logo.png", type: "image/png" },
    ],
    shortcut: "/icon.svg",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    url: "https://png2svg.io",
    siteName: "PNG2SVG.IO",
    title: "PNG2SVG.IO",
    description:
      "Convert PNG artwork into clean SVG, EPS, and DXF exports directly in your browser with layered vector output.",
    locale: "en_US",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "PNG2SVG.IO logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PNG2SVG.IO",
    description:
      "Convert PNG artwork into clean SVG, EPS, and DXF exports directly in your browser with layered vector output.",
    creator: "@bliitzkrieg",
    images: ["/logo.png"],
  },
  category: "design tools",
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
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
