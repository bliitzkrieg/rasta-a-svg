import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const siteDescription =
  "Free online PNG to SVG converter: turn PNG images into clean layered SVG, EPS and DXF vectors right in your browser. No uploads, no sign-up, no watermarks.";

const webAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PNG2SVG.IO",
  url: "https://png2svg.io",
  applicationCategory: "DesignApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description: siteDescription,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://png2svg.io"),
  title: {
    default: "Free PNG to SVG Converter | PNG2SVG.IO",
    template: "%s | PNG2SVG.IO",
  },
  description: siteDescription,
  applicationName: "PNG2SVG.IO",
  keywords: [
    "png to svg",
    "png to svg converter",
    "convert png to vector",
    "svg converter",
    "eps export",
    "dxf export",
    "vector converter",
    "image to vector",
    "svg for cricut",
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
    title: "Free PNG to SVG Converter | PNG2SVG.IO",
    description: siteDescription,
    locale: "en_US",
    images: [
      {
        url: "/logo.png",
        width: 1325,
        height: 340,
        alt: "PNG2SVG.IO logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free PNG to SVG Converter | PNG2SVG.IO",
    description: siteDescription,
    creator: "@bliitzkrieg",
    images: ["/logo.png"],
  },
  category: "design tools",
  other: {
    "google-adsense-account": "ca-pub-1821039974714849",
  },
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
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1821039974714849"
          strategy="afterInteractive"
          crossOrigin="anonymous"
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-KN4F0R7K5F"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-KN4F0R7K5F');`}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }}
        />
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
