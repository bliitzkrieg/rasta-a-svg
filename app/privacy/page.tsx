import type { Metadata } from "next";
import { ArticleLayout } from "@/components/ArticleLayout";
import { CONTACT_EMAIL } from "@/lib/siteNav";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How PNG2SVG.IO handles your data: images are converted on your device and never uploaded. Details on analytics, advertising cookies and your choices.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy",
    description:
      "Images are converted on your device and never uploaded. Details on analytics, advertising cookies and your choices.",
    url: "https://png2svg.io/privacy",
  },
};

const LAST_UPDATED = "September 30, 2026";

export default function PrivacyPage() {
  return (
    <ArticleLayout
      title="Privacy Policy"
      lede={`Last updated ${LAST_UPDATED}. The short version: your images never leave your device. We use analytics and ads to keep the site free, and this page explains exactly how.`}
      crumbs={[{ label: "Home", href: "/" }, { label: "Privacy Policy" }]}
      showCta={false}
    >
      <h2>Your images never leave your device</h2>
      <p>
        PNG2SVG.IO converts images entirely in your web browser using
        WebAssembly. The images you add, and the SVG, EPS and DXF files
        produced from them, are never uploaded to our servers or anyone
        else&apos;s.
      </p>
      <p>
        While you work, the images you add are held in your browser&apos;s
        local storage (IndexedDB) so the converter can process them. They are
        cleared when you remove them, use &ldquo;Remove all images&rdquo;, or
        next open the converter. Your converter settings and theme choice are
        kept in your browser&apos;s local storage. All of this stays on your
        device, and you can clear it at any time in your browser&apos;s
        site-data settings.
      </p>

      <h2>Analytics</h2>
      <p>
        We use Google Analytics 4 to understand how the site is used, for
        example which pages are visited and how many conversions and downloads
        happen. Along with standard page views, we record a few anonymous
        events: that files were added (with a file count), that a download
        happened (with its format), and that an example image was loaded. These
        events never include your images, file contents or file names.
      </p>
      <p>
        Google Analytics uses cookies and collects information such as your
        approximate location, device and browser type. See{" "}
        <a href="https://policies.google.com/privacy" rel="noopener noreferrer">
          Google&apos;s Privacy Policy
        </a>{" "}
        for how Google processes this data.
      </p>

      <h2>Advertising</h2>
      <p>
        The site is free because it shows ads served by Google AdSense.
        Third-party vendors, including Google, use cookies to serve ads based on
        your prior visits to this website or other websites. Google&apos;s use
        of advertising cookies enables it and its partners to serve ads to you
        based on your visits to this site and/or other sites on the Internet.
      </p>
      <p>
        You can opt out of personalized advertising by visiting{" "}
        <a href="https://adssettings.google.com" rel="noopener noreferrer">
          Google Ads Settings
        </a>
        . You can also learn more at{" "}
        <a href="https://policies.google.com/technologies/ads" rel="noopener noreferrer">
          How Google uses cookies in advertising
        </a>{" "}
        or opt out of some third-party vendors&apos; use of cookies at{" "}
        <a href="https://www.aboutads.info/choices" rel="noopener noreferrer">
          aboutads.info
        </a>
        .
      </p>

      <h2>Cookies and consent</h2>
      <p>
        Visitors in the European Economic Area, the United Kingdom and
        Switzerland are asked for consent before advertising and analytics
        cookies are used. Until you choose, Google&apos;s consent mode keeps
        those cookies off. You can change your choice at any time through the
        privacy and cookie settings link shown by the consent message, or by
        clearing this site&apos;s cookies in your browser.
      </p>

      <h2>Hosting and server logs</h2>
      <p>
        Like any website, our hosting provider processes standard technical
        request data (such as IP address, browser user agent and the page
        requested) to deliver pages and protect the service. This data is not
        linked to your images, which are never sent to the server.
      </p>

      <h2>Children</h2>
      <p>
        PNG2SVG.IO is a general-audience tool and is not directed at children
        under 13. We do not knowingly collect personal information from
        children.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change how the site handles data, we will update this page and
        the date at the top.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </ArticleLayout>
  );
}
