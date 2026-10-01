import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import Script from "next/script";
import { ADSENSE_CLIENT } from "@/lib/ads";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const SITE_URL = "https://png2svg.io";

const siteDescription =
  "Convert PNG to SVG free in your browser. Pixel-perfect layered vectors for Cricut, laser cutting and print. Also exports EPS and DXF. No upload, no sign-up.";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "PNG2SVG.IO",
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "PNG2SVG.IO",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebApplication",
      name: "PNG2SVG.IO",
      url: SITE_URL,
      applicationCategory: "DesignApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript and WebAssembly",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "PNG to SVG",
        "PNG to EPS",
        "PNG to DXF",
        "JPG and WebP input",
        "Batch conversion",
        "Runs locally in the browser",
      ],
      screenshot: `${SITE_URL}/og-image.png?v=2`,
      description: siteDescription,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

// EEA, UK and Switzerland: deny ad/analytics storage until the visitor
// answers the consent message (Google's CMP, enabled in the AdSense
// dashboard, updates these). Everywhere else the defaults stay granted.
const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL",
  "PT", "RO", "SK", "SI", "ES", "SE", "GB", "CH",
];

// Runs inline in <head>, before AdSense or gtag.js load: Google requires the
// consent default to be set before any of its tags read it.
const CONSENT_DEFAULT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',region:${JSON.stringify(CONSENT_REGIONS)}});`;

// Loads AdSense from <head> right after the consent default, so the order is
// guaranteed. (A plain async <script> tag gets hoisted above inline scripts
// by React 19, and next/script adds a data-nscript attribute AdSense rejects.)
const ADSENSE_LOADER = `(function(){var s=document.createElement('script');s.async=true;s.crossOrigin='anonymous';s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}';document.head.appendChild(s);})();`;

const GA_INIT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-KN4F0R7K5F');`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Free PNG to SVG Converter: Pixel-Perfect, No Upload | PNG2SVG.IO",
    template: "%s | PNG2SVG.IO",
  },
  description: siteDescription,
  applicationName: "PNG2SVG.IO",
  authors: [{ name: "Bliitzkrieg", url: "https://github.com/bliitzkrieg" }],
  creator: "Bliitzkrieg",
  publisher: "PNG2SVG.IO",
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
      { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
    ],
    shortcut: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "PNG2SVG.IO",
    title: "Free PNG to SVG Converter: Pixel-Perfect, No Upload",
    description: siteDescription,
    locale: "en_US",
    images: [
      {
        url: "/og-image.png?v=2",
        width: 1200,
        height: 630,
        alt: "PNG2SVG.IO: a zoomed-in fox logo, blocky PNG pixels on one side and the smooth converted SVG on the other",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free PNG to SVG Converter: Pixel-Perfect, No Upload",
    description: siteDescription,
    creator: "@bliitzkrieg",
    images: ["/og-image.png?v=2"],
  },
  category: "design tools",
  other: {
    "google-adsense-account": ADSENSE_CLIENT,
  },
};

export const viewport: Viewport = {
  themeColor: "#2281b3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint (no flash). */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
          suppressHydrationWarning
        />
        <script
          dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULT }}
          suppressHydrationWarning
        />
        <script
          dangerouslySetInnerHTML={{ __html: ADSENSE_LOADER }}
          suppressHydrationWarning
        />
      </head>
      <body className={`${manrope.className} ${manrope.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Script id="ga4-init" strategy="afterInteractive">
          {GA_INIT}
        </Script>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-KN4F0R7K5F"
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  );
}
