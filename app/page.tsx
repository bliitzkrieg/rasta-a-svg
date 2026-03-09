import type { Metadata } from "next";
import Image from "next/image";
import {
  PricingTable,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "PNG to SVG",
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <a href="/" className={styles.brandLink} aria-label="png2svg.io home">
          <Image
            src="/logo.png"
            alt="png2svg.io"
            width={220}
            height={48}
            className={styles.logo}
            priority
          />
        </a>
        <div className={styles.topbarActions}>
          <nav className={styles.navLinks} aria-label="Primary navigation">
            <a href="#benefits">Benefits</a>
            <a href="#how-it-works">How it works</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <span className={styles.authRow}>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button type="button">Sign in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button type="button">Get free access</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <a href="/app" className={styles.inlineLink}>
                Open app
              </a>
              <span className={styles.avatarWrap}>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: styles.clerkAvatar,
                    },
                  }}
                />
              </span>
            </Show>
          </span>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.eyebrow}>Made for creators</span>
          <h1>Turn your PNG designs into clean files for stickers, shirts, signs, and more.</h1>
          <p className={styles.heroBody}>
            PNG2SVG.IO helps creators clean up artwork fast. Upload your
            designs, run them through the app, and download files that are easier
            to use for cutting machines, print shops, and digital products.
          </p>
          <div className={styles.heroActions}>
            <a href="/app" className={styles.primaryCta}>
              Open the app
            </a>
            <a href="#pricing" className={styles.secondaryCta}>
              View pricing
            </a>
          </div>
          <ul className={styles.heroList}>
            <li>Convert a whole batch in one go</li>
            <li>Get results fast</li>
            <li>Keep your artwork private</li>
          </ul>
        </div>
        <aside className={styles.heroSide}>
          <div className={styles.summaryCard}>
            <span className={styles.eyebrow}>Free tier</span>
            <h2>3 generations per day</h2>
            <p>
              Sign in and try the app free every day. Upgrade when you want
              unlimited conversions for bigger product batches.
            </p>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.eyebrow}>Great for</span>
            <p>
              Great for logo files, shirt graphics, sticker art, laser-cut
              designs, and digital downloads you want to sell with a cleaner finish.
            </p>
          </div>
        </aside>
      </section>

      <section id="benefits" className={styles.section}>
        <div className={styles.sectionIntro}>
          <span className={styles.eyebrow}>Why creators like it</span>
          <h2>Built to help you prep artwork faster.</h2>
        </div>
        <div className={styles.cardGrid}>
          <article className={styles.infoCard}>
            <h3>Handle a batch at once</h3>
            <p>
              Drop in multiple designs at the same time instead of repeating the
              same steps over and over for every product file.
            </p>
          </article>
          <article className={styles.infoCard}>
            <h3>Get cleaner files quickly</h3>
            <p>
              Move from rough PNG artwork to cleaner cut-ready or print-ready files
              without slowing down your product workflow.
            </p>
          </article>
          <article className={styles.infoCard}>
            <h3>Download the formats you need</h3>
            <p>
              Export SVG, EPS, and DXF from the same design so you can use the
              result across different tools and fulfillment setups.
            </p>
          </article>
        </div>
      </section>

      <section id="how-it-works" className={styles.section}>
        <div className={styles.sectionIntro}>
          <span className={styles.eyebrow}>How it works</span>
          <h2>Simple enough to fit into your normal creative workflow.</h2>
        </div>
        <div className={styles.stepGrid}>
          <article className={styles.stepCard}>
            <strong>01</strong>
            <h3>Add your artwork</h3>
            <p>Upload one design or a full group of PNGs from your project folder.</p>
          </article>
          <article className={styles.stepCard}>
            <strong>02</strong>
            <h3>Fine-tune the look</h3>
            <p>Adjust the result until the shapes look right for your product.</p>
          </article>
          <article className={styles.stepCard}>
            <strong>03</strong>
            <h3>Download and use it</h3>
            <p>Save the finished file and move on to your mockup, product setup, or production step.</p>
          </article>
        </div>
      </section>

      <section id="pricing" className={styles.section}>
        <div className={styles.sectionIntro}>
          <span className={styles.eyebrow}>Pricing</span>
          <h2>Start free, then upgrade when you need more volume.</h2>
          <p className={styles.sectionBody}>
            Try it with 3 free generations each day. Upgrade for unlimited
            conversions when you are processing more artwork regularly.
          </p>
        </div>
        <div className={styles.pricingWrap}>
          <PricingTable for="user" newSubscriptionRedirectUrl="/app" />
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <span className={styles.eyebrow}>Ready to start</span>
          <h2>Open the app and turn your next design into a cleaner sellable file.</h2>
        </div>
        <div className={styles.heroActions}>
          <a href="/app" className={styles.primaryCta}>
            Launch app
          </a>
          <a href="#pricing" className={styles.secondaryCta}>
            Compare plans
          </a>
        </div>
      </section>
    </main>
  );
}
