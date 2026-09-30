# Site design feedback: UX, SEO, ads, look and feel

This reviews the **production site** (https://png2svg.io, `main` at `f7b0d8a`), checked on desktop (1280 px), mobile (iPhone 12 Pro, 390 px), and in light and dark themes, both before and after converting an image. It does **not** review the unmerged `marketing-codex` / `marketing-gemini` branches. If one of those gets merged first, re-apply these items on top of it.

**Goal:** make the site look good enough that visitors trust it and try it, rank it for more searches, and place ads without hurting either.

---

## Instructions for the implementer (read first)

- **Do not modify** anything under `lib/vectorize/`, `lib/image/`, `rust/`, `workers/`, `public/vendor/`, or `tools/`. That's the conversion engine. Every item below is UI, content, or metadata.
- Each item has **Where** (files), **Do** (exact change), and **Done when** (how to check). Follow the "Do" steps literally. Where copy is given in quotes, use it word for word.
- Keep the existing stack: Next.js App Router, CSS Modules plus `app/globals.css`, `lucide-react` for icons, and `@radix-ui/react-alert-dialog` / `@radix-ui/react-tooltip`, which are already installed. Don't add a CSS framework.
- Use the existing CSS variables in `app/globals.css` (`--brand-primary`, `--brand-secondary`, `--ink`, `--line`, `--space-*`, `--radius-*`). New tokens are listed in item L1.
- Every change must work in **light and dark** theme and at **390 px** width.
- After each group of items run `npm run typecheck && npm run lint && npm run build`.
- Work through the items in the order in "Implementation order" at the end.

---

## P0: bugs to fix first (small, high impact)

### B1. Every subpage title shows the brand twice

- **Where:** `app/png-to-eps/page.tsx`, `app/png-to-dxf/page.tsx`, `app/faq/page.tsx`, and the three `app/guides/*/page.tsx` files.
- **Problem:** each page's `metadata.title` already ends in `" | PNG2SVG.IO"`, and the root layout's `title.template` (`"%s | PNG2SVG.IO"`) appends it again. The live tab title is `Free PNG to EPS Converter | PNG2SVG.IO | PNG2SVG.IO`. Google shows this in search results.
- **Do:** remove the trailing `" | PNG2SVG.IO"` from the `title` string in all six files. For example `"Free PNG to EPS Converter | PNG2SVG.IO"` becomes `"Free PNG to EPS Converter"`. Leave `openGraph.title` / `twitter.title` alone if they exist; those don't use the template.
- **Done when:** each page's `<title>` contains `PNG2SVG.IO` exactly once.

### B2. Article `<h1>` renders at body size (16 px)

- **Where:** `app/globals.css` (`:root`), used by `components/ArticleLayout.module.css:33`.
- **Problem:** `.title { font-size: var(--text-3xl) }`, but `--text-3xl` is never defined, so the H1 falls back to 16 px. On `/png-to-eps` the H1 "Free PNG to EPS Converter" is smaller than every H2 on the page.
- **Do:** add the missing tokens to `:root` in `app/globals.css`, right after `--text-2xl`:
  ```css
  --text-3xl: 2.25rem;
  --text-4xl: 3rem;
  --text-5xl: 3.75rem;
  ```
- **Done when:** the H1 on `/png-to-eps` is visibly the largest text on the page (36 px desktop, 24 px under 720 px, per the existing media query).

### B3. The homepage has no `<h1>`, and its heading sits inside a `<button>`

- **Where:** `components/CompareSlider.tsx` (empty state, the `!originalUrl` branch).
- **Problem:** the hero text "Turn PNGs into clean, layered vectors in seconds." is an `<h2>` inside `<button className="compare-canvas compare-canvas-empty">`. The homepage has **zero** `<h1>` elements. Headings inside a button are flattened into the button's label for screen readers and are weak for SEO.
- **Do:** item H1 below rebuilds this hero. The minimum fix now: change the outer `<button>` to a plain `<div>` that still opens the file picker on click. Put a real `<button type="button">Choose PNG files</button>` inside it for keyboard and screen-reader users, and change the `<h2>` to an `<h1>`. Don't give the outer `<div>` `role="button"`: that would flatten the heading again.
- **Done when:** `document.querySelectorAll('h1').length === 1` on `/`.

### B4. FAQ answers are indented 40 px

- **Where:** `components/SeoContent.module.css`.
- **Problem:** answers use `<dd>`, which has a browser-default `margin-left: 40px`, so every answer sits indented under its question (visible on the homepage FAQ cards).
- **Do:** add `.faqItem dd { margin: 0; }`. Also set `.faqItem dt h3 { margin: 0 0 var(--space-2); }` so the spacing is intentional.
- **Done when:** question and answer text share the same left edge.

### B5. Result panel copy errors

- **Where:** `components/ResultDetail.tsx`.
- **Do:**
  - `"{n} paths"` becomes `{n === 1 ? "1 path" : `${n.toLocaleString()} paths`}`.
  - Format stat numbers with `toLocaleString()` (`98684` becomes `98,684`).
  - Item W3 replaces this panel's content; do B5 now anyway if W3 is later.

### B6. Wrong app name and colors in the manifest

- **Where:** `app/manifest.ts`.
- **Problem:** the name is `"Raster to Vector Lab"` / `"R2V Lab"`, the colors don't match the brand, and `theme_color #0f172a` doesn't match `viewport.themeColor #2281B3` in the layout.
- **Do:** `name: "PNG2SVG.IO: Free PNG to SVG Converter"`, `short_name: "PNG2SVG"`, `description` = the `siteDescription` string from `app/layout.tsx`, `background_color: "#f6f5f3"` (matches `--bg`), `theme_color: "#2281b3"`. Add a 192 px and a 512 px PNG icon (export them from `public/icon.svg`) to `icons`.

### B7. The root canonical is inherited by pages that don't set their own

- **Where:** `app/layout.tsx` (`alternates: { canonical: "/" }`), `app/page.tsx`.
- **Problem:** any page without its own `alternates.canonical` inherits canonical `/`. Today that applies to the 404 page (verified live: `/privacy` → 404 with `<link rel=canonical href="https://png2svg.io/">`) and to every future page that forgets to set it. Google may then treat new pages as duplicates of the homepage.
- **Do:** delete `alternates` from the root layout metadata. In `app/page.tsx` add `export const metadata: Metadata = { alternates: { canonical: "/" } };`. **Every new page created from this document must set its own `alternates.canonical`.**

### B8. AdSense is loaded in a way it doesn't support

- **Where:** `app/layout.tsx`.
- **Problem:** the console warns *"AdSense head tag doesn't support data-nscript attribute."* That attribute is added by `next/script`.
- **Do:** replace the AdSense `<Script …/>` with a plain tag inside an explicit `<head>` in `RootLayout`:
  ```tsx
  <html lang="en" suppressHydrationWarning>
    <head>
      <script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1821039974714849"
        crossOrigin="anonymous"
      />
    </head>
    <body …>
  ```
  Keep GA4 on `next/script`, which is fine for gtag.
- **Done when:** that console warning no longer appears.

### B9. Required legal pages are missing (blocks AdSense approval and GDPR compliance)

- **Problem:** `/privacy`, `/terms`, and `/about` are 404. AdSense program policies require a privacy policy that discloses Google's use of cookies for ads. GA4 and AdSense set cookies.
- **Do:** create three pages using `ArticleLayout` (see L5, which adds the site header and footer to it):
  - `app/privacy/page.tsx`, title "Privacy Policy". Sections:
    - **"Your images never leave your device"**: conversion runs locally with WebAssembly, and files are stored only in your browser's IndexedDB until you delete them.
    - **"Analytics"**: Google Analytics 4 with the anonymous events it collects (`file_upload`, `file_download`, `download_all`).
    - **"Advertising"**: Google AdSense. Include Google's required disclosure: third-party vendors, including Google, use cookies to serve ads based on prior visits. Link to https://policies.google.com/technologies/ads and to https://adssettings.google.com for opting out.
    - **"Cookies and consent"**.
    - **"Contact"**: use a real address the owner provides. Put `TODO_CONTACT_EMAIL` as a placeholder and flag it in the PR description.
    - **"Last updated"**: today's date.
  - `app/terms/page.tsx`, title "Terms of Use". Cover free use, no warranty, users own their images and outputs, and no illegal content.
  - `app/about/page.tsx`, title "About PNG2SVG.IO". Say who makes it, why it's free (ad-supported), and why it's private (local processing).
  - Add all three to `app/sitemap.ts` (priority 0.3) and link them from the footer (L5).

### B10. EEA/UK consent

- **Problem:** Google requires a certified consent platform (CMP) for AdSense ads served to users in the EEA, UK, and Switzerland. Without one, ads there are limited or not served, and GA4 collects without consent.
- **Do:** this is mostly configuration in the AdSense dashboard, done by the owner, not code. Enable **AdSense → Privacy & messaging → European regulations message** (Google's own free CMP).
- **Code part:** add Google Consent Mode v2 defaults **before** the gtag config in the existing `ga4-init` inline script:
  ```js
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', region: ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','GB','CH']
  });
  gtag('js', new Date()); gtag('config', 'G-KN4F0R7K5F');
  ```
  Google's CMP message updates consent automatically once it's enabled.

---

## Homepage hero and first impression (biggest conversion lever)

This is what visitors see today on desktop: a 585 px tall, mostly empty dark rounded box with two blurred orbs, a small headline, "Drop or click to choose PNG files." in grey, and the line **"Images are downscaled to 1000 px on the long edge before tracing."** There's no visible button, no example of the output, and no trust signals. The header shows an "Idle" status pill. Nothing shows what the product produces, and the only concrete statement is a limitation.

### H1. Rebuild the empty state as a real hero

- **Where:** `components/CompareSlider.tsx` (empty branch) and its CSS in `app/globals.css` (`.compare-canvas-empty`, `.empty-state*`). Consider extracting it into a new `components/HeroDropzone.tsx` with its own `HeroDropzone.module.css`.
- **Layout (desktop ≥ 1024 px):** a two-column hero inside the existing canvas card, **420 px tall** (not 585). Left column is 55% width and left-aligned text. Right column is 45% with the demo visual (H2).
- **Layout (mobile):** a single column, with the text block first and the demo below it at 240 px tall.
- **Content of the left column, top to bottom:**
  1. **Eyebrow chip** (keep the existing style): `Free · Private · No sign-up`
  2. **`<h1>`**: `Convert PNG to SVG, pixel-perfect and free`
     - Font size `clamp(2.25rem, 1.2rem + 3vw, 3.5rem)`, weight 800, `letter-spacing: -0.03em`, `line-height: 1.05`, color `var(--ink)`.
     - Wrap the words `pixel-perfect` in `<span class="hero-accent">` colored `var(--brand-secondary)`.
  3. **Subhead** `<p>`, 1.125 rem, `var(--ink-muted)`, max-width 34 rem: `Turn logos, icons, and illustrations into clean layered SVG, EPS, and DXF files. Everything runs in your browser, so your images are never uploaded.`
  4. **Button row**, gap `var(--space-3)`:
     - **Primary:** `<button>` with the lucide `Upload` icon and the label `Choose PNG files`. 52 px tall, padding `0 1.5rem`, radius 999 px, background `#E8590C`, white text at 1.1875 rem, weight 700, hover `#C2410C` (contrast rules in L4), and a focus ring `0 0 0 3px color-mix(in srgb, var(--brand-secondary) 35%, transparent)`. It opens the hidden file input.
     - **Secondary:** a ghost `<button>` with the label `Try an example`: transparent background, 1 px `var(--line)` border, `var(--ink)` text. It loads a bundled sample image into the queue (see H3).
  5. **Hint line**, 0.875 rem, `var(--ink-soft)`:
     - On devices with a mouse: `…or drop files anywhere on this page`.
     - On touch devices (`@media (hover: none)`): hide this line.
  6. **Trust row**: three inline items with lucide icons 16 px in `var(--brand-primary)`, gap `var(--space-5)`, 0.875 rem text:
     - `ShieldCheck` "Files never leave your device"
     - `BadgeCheck` "Free, no watermark"
     - `Layers` "SVG · EPS · DXF"
- **Remove** the line "Images are downscaled to 1000 px on the long edge before tracing." from the hero. Move that information to the FAQ ("Is there a file size limit?" already exists on `/faq`) and to a tooltip on the settings panel.
- **Drag-over state:** when files are dragged over the page (`data-dragging="true"` already exists on `<main>`), the hero card gets a 2 px dashed `var(--brand-secondary)` outline and the demo visual fades to 30% opacity. Keep the existing full-page "Drop PNG files anywhere" overlay.
- **Done when:**
  - At 1280×800, the H1, both buttons, the trust row, and the demo visual are all visible without scrolling.
  - At 390×844, the H1 and the primary button are visible without scrolling.

### H2. Show the product working in the hero (demo visual)

- **Do:**
  - The right column shows a **before/after split** of one sample image. The left half is the PNG, rendered **upscaled with `image-rendering: pixelated`** so the pixels show. The right half is the SVG version, crisp.
  - Draw a vertical orange divider (reuse `.compare-divider` styling), with small chips labeled `PNG` (top-left) and `SVG` (top-right).
  - Animate the divider slowly from 30% to 70% and back (6 s, `ease-in-out`, infinite), and stop the animation under `@media (prefers-reduced-motion: reduce)`.
  - Zoom into a region of the image with curves (for example 3× on a letter or an edge) so the "pixelated vs crisp" difference is obvious at hero size.
- **Assets:** create `public/examples/` with `logo.png` plus a pre-converted `logo.svg`, both **under 150 KB**. Pick a simple flat logo or icon with curves. Generate the SVG by running it through the site and downloading it. If the SVG is too large, pick a simpler image.
- Replace the two blurred "orb" `<span>`s and the orbit rings (`empty-stateGlow*`, `empty-stateOrbit*`, `empty-stateBeam`) with this demo. They look generic and communicate nothing.
- Add alt text: `alt="Pixelated PNG logo on the left, crisp SVG vector conversion on the right"`.

### H3. "Try an example" samples

- **Where:** `components/ConverterApp.tsx` (`onFiles` already accepts `File[]`).
- **Do:**
  - Add 3 sample PNGs to `public/examples/`: `logo.png`, `icon.png`, `illustration.png`, each under 1000 px and under 300 KB.
  - "Try an example" fetches one (logo by default) and passes it to `onFiles`:
    ```ts
    const res = await fetch("/examples/logo.png");
    const blob = await res.blob();
    void onFiles([new File([blob], "example-logo.png", { type: "image/png" })]);
    ```
  - Track it with `trackEvent("example_loaded", { name: "logo" })`.
- **Why:** many visitors don't have a PNG ready. Letting them see a conversion in one click increases engagement and time on page, which also increases ad viewability.

### H4. Header: navigation and cleanup

- **Where:** `components/ConverterApp.tsx` (`<header>`), `app/page.module.css`. Extract it into a shared `components/SiteHeader.tsx` (see L5).
- **Do:**
  - **Remove the "Idle" status pill.** Show the phase only while something is processing, and inside the preview area, not in the global header. The "Offline" pill can stay but only renders when offline, as it does now.
  - **Add nav links** to the right of the logo (desktop ≥ 900 px): `PNG to SVG` (`/`), `PNG to EPS` (`/png-to-eps`), `PNG to DXF` (`/png-to-dxf`), `Guides` (`/guides`, see S5), `FAQ` (`/faq`). Style: 0.9375 rem, weight 600, `var(--ink-muted)`, hover `var(--ink)`. The current page's link gets `var(--ink)` and `aria-current="page"`.
  - **Theme toggle:** make it an icon-only 36×36 button (sun/moon/monitor icon for light/dark/system) with a tooltip, instead of the "◐ System" pill.
  - **Mobile (< 900 px):** a single row: logo left, a hamburger button right (`Menu` icon) that opens a full-width dropdown with the same links, plus the theme toggle as the last row. Today the header wraps onto two rows on mobile.
  - The header height is 64 px, and it becomes sticky with a translucent background (`backdrop-filter: blur(12px)`, background `color-mix(in srgb, var(--bg) 80%, transparent)`, bottom border 1 px `var(--line)`) once the page is scrolled more than 8 px.

---

## Workspace (after an image is uploaded)

What I saw after converting an image: three separate sets of `SVG / EPS / DXF` buttons that look like **tabs or a format toggle** (one looks "selected") but actually **download immediately**; a stats row of `98684 NODES · 6365 PATHS · 846 ms`; a list of 400+ rows named `COLOR_01 … COLOR_423` with swatches that are nearly invisible on the dark theme; and 11 settings with engine jargon ("Hierarchical", "Filter Speckle", "Gradient Step", "Splice Threshold") that need a manual "Regenerate" click.

### W1. One clear download action

- **Where:** `components/ExportButtons.tsx`, `components/ResultDetail.tsx`, `components/CompareSlider.tsx` (floating export).
- **Do:**
  - Replace the three-button group with a **split button**:
    - **Main part:** `Download SVG` with the lucide `Download` icon. Rounded like the hero primary button, but 44 px tall with 1 rem text on `var(--brand-secondary-strong)` (#C2410C; see L4), plus the file size in a lighter weight, for example `Download SVG · 1.2 MB`.
    - **Chevron part:** a dropdown menu with `Download EPS`, `Download DXF`, and a separator, then `Download all (ZIP)` when more than one image is done.
  - Compute the file size with `new Blob([result.svg]).size`, formatted as KB or MB with one decimal.
  - Put this split button in **two places only**:
    1. Overlaid bottom-right of the compare canvas (replacing the current floating group at top-right).
    2. At the top of the Result panel.

    Remove the third copy.
- After a download, show a small toast bottom-center for 3 s: `Saved example-logo.svg (1.2 MB)`.
- **Done when:** a first-time user can find the download action in under 2 seconds, and no button that downloads looks like a tab.

### W2. Compare slider people can actually drag

- **Where:** `components/CompareSlider.tsx`, `.compare-*` in `app/globals.css`.
- **Do:**
  - Make the **divider itself** draggable. Add a 36 px round handle centered on the divider (white fill, 2 px orange border, lucide `ChevronsLeftRight` icon), and handle `pointerdown`/`pointermove`/`pointerup` on the canvas to set `sliderPosition`.
  - Keep the existing `<input type="range">` for keyboard and screen readers, but visually hide it (`.sr-only`) instead of showing a second slider bar under the image.
  - Put the label chips `Original` (top-left) and `Vector` (top-right) **on** the image, replacing the text row under it.
  - Add a small toolbar top-left of the canvas:
    - **Zoom:** `Fit` / `100%` / `200%` / `400%`. At 100% and above, render the PNG with `image-rendering: pixelated` and let the canvas scroll.
    - **Background:** checkerboard / white / black. The checkerboard is a CSS `conic-gradient` 16 px pattern, so transparency is visible.
- **Why:** users judge quality by zooming in. This is the product's main selling point, and today there's no way to zoom.

### W3. Result panel users can read

- **Where:** `components/ResultDetail.tsx`.
- **Do:**
  - Replace the three stat cards with: `Colors` (number of layers), `File size` (as in W1), and `Converted in` (`0.8 s`, one decimal). Move node and path counts into the layer disclosure below as small grey text.
  - Put the layer list behind a disclosure: `<details><summary>Color layers (423)</summary>…</details>`, collapsed by default.
  - Inside it, name each layer by its hex color (`#1A2B3C`, monospace) instead of `COLOR_01`.
  - Make the swatches 16 px with `border: 1px solid color-mix(in srgb, var(--ink) 20%, transparent)` so dark swatches are visible on the dark theme.
  - Show at most 50 rows, then a `Show all` button.

### W4. Settings: presets first, jargon hidden

- **Where:** `components/SettingsPanel.tsx`.
- **Do:**
  - At the top of the panel, add a **preset segmented control** (real tabs this time, `role="radiogroup"`) with these options:
    - `Pixel-perfect`: the current `DEFAULT_SETTINGS`, selected by default.
    - `Logo / flat art`, `Illustration`, `Black & white`.

    Each preset maps to a settings object. **The owner must supply the exact values for all presets except Pixel-perfect**, so add them as a clearly marked `PRESETS` constant with TODO values copied from `DEFAULT_SETTINGS`. For `Black & white`, `clusteringMode: "binary"`.
  - Put all current controls in a collapsed `Advanced settings` disclosure below the presets.
  - Rename the labels to plain language and add a short `AppTooltip` help text for each:

    | Current label | New label | Tooltip |
    |---|---|---|
    | Clustering | Color mode | "Color keeps every color. Black & white makes a single-color cut file." |
    | Hierarchical | Shape stacking | "Stacked layers shapes on top of each other. Cutout cuts holes so shapes don't overlap." |
    | Filter Speckle | Remove specks smaller than | "Drops tiny spots. 1 keeps every pixel." |
    | Color Precision | Color detail | "Higher keeps more distinct colors." |
    | Gradient Step | Color merge threshold | "Higher merges similar shades into one layer." |
    | Curve Fitting | Edge style | "Spline gives smooth curves, Polygon gives straight segments, Pixel keeps exact pixel edges." |
    | Corner Threshold | Corner sharpness | — |
    | Segment Length | Curve smoothness | — |
    | Splice Threshold | Curve joining | — |
    | Path Precision | Decimal places | — |
  - **Re-convert automatically**: when any setting or preset changes, call the existing `onRegenerate` after a 500 ms debounce. Keep the Regenerate button, but rename it `Reset to defaults` and make it restore `DEFAULT_SETTINGS`.
- **Done when:** a user who never opens "Advanced settings" can still get a good result, and nothing visible outside the Advanced section uses engine jargon.

### W5. Queue list

- **Where:** `components/QueueList.tsx`, `components/QueueList.module.css`.
- **Do:**
  - Turn the per-item red outlined `Remove` button into a 28×28 ghost icon button (`Trash2`, `var(--ink-soft)`, red on hover) with the tooltip "Remove".
  - Show a 40×40 thumbnail of each PNG (the `originalUrl` blob) on the left of each row.
  - `Delete all` becomes a text-style button (no red outline), and it keeps the existing AlertDialog confirmation.
  - `Download all` moves into the W1 dropdown when more than one image is done. Remove it from the queue panel.
  - The panel header button `Choose PNG files` becomes `Add images` with a `Plus` icon.

### W6. Accept JPG and WebP (UX + SEO; tiny code change)

- **Where:** `components/ConverterApp.tsx` (`onFiles` filter: `file.type === "image/png"`), and `components/CompareSlider.tsx` plus `QueueList.tsx` (`accept="image/png"`).
- **Do:**
  - Accept `image/png`, `image/jpeg`, and `image/webp`, both in the filter and in every `accept` attribute. Decoding already goes through `createImageBitmap`, which handles all three.
  - Update the copy: "Drop PNG files anywhere" becomes "Drop images anywhere", and the button stays "Choose PNG files" on the homepage but becomes "Choose images" in the queue.
  - When the downloaded file name is built, replace any of `.png|.jpg|.jpeg|.webp` (not just `.png`).
- **Why:** "jpg to svg" and "image to svg" are high-volume searches (see S4), and today a JPG dropped on the page is silently ignored.

---

## Look and feel

### L1. Type and spacing scale

- Add the tokens from B2. Use these sizes for headings site-wide:
  - hero H1: see H1
  - page H1: `--text-4xl` (desktop), `--text-3xl` (under 720 px)
  - section H2: `clamp(1.75rem, 1.2rem + 1.5vw, 2.25rem)`, weight 800, `letter-spacing: -0.02em`
  - card H3: `--text-lg`, weight 700
- Body text is 1 rem with `line-height: 1.65` in prose and 1.5 in UI.
- **Section rhythm:** every homepage section below the workspace gets `padding-block: 6rem` (desktop) / `4rem` (under 720 px) and a centered title block (eyebrow chip, H2, one-line lede).

### L2. One container width

- **Problem:** the workspace uses `max-width: 1480px`, while the content sections use `72rem` (1152 px) and articles `48rem`. The page looks misaligned when scrolling from the tool to the content.
- **Do:** define `--container: 1200px` and `--container-prose: 44rem`. Apply `--container` to the header, workspace, all homepage sections, and the footer. Articles keep the prose width for text, but their header and footer use `--container`.

### L3. Remove the dead gap under the hero

- **Where:** `app/page.module.css` `.page { min-height: 100vh; … padding-bottom: 3rem }`.
- **Problem:** `min-height: 100vh` on `<main>` forces the empty space (about 130-170 px on desktop, about 190 px on mobile) between the tool and "How it works".
- **Do:** remove `min-height: 100vh` from `.page`. With a 420 px hero (H1), the next section should start about 64 px below the hero card.

### L4. Color roles

- **Do:**
  - **Orange (`--brand-secondary`, #FB6A15) is the only primary-action color:** hero CTA, download split button, compare divider and handle.
  - **Blue (`--brand-primary`, #2281B3) is for links, focus rings, icons, step numbers, and selected states** (preset tabs, active nav).
  - Today some primary buttons are blue (`.btn-primary` on the SVG export) while the slider is orange; make them consistent as above.
  - Check contrast: white text on #FB6A15 is only 2.9:1, which fails WCAG AA. Use this rule:
    - Large CTAs (the hero button): white text at **1.1875 rem, weight 700** on **#E8590C** (3.6:1, which passes AA for large text).
    - Smaller orange buttons (the 44 px download split button, 1 rem text): white on **#C2410C** (5.2:1). Add it as `--brand-secondary-strong: #c2410c`.
    - Keep #FB6A15 for non-text uses (divider, handle, accents).

### L5. Shared site header and footer on every page

- **Where:** new `components/SiteHeader.tsx` (from H4) and `components/SiteFooter.tsx`. Use them in `ConverterApp` (replacing the inline header), in `ArticleLayout.tsx` (which today has **no header, no logo, and no footer**; article visitors have no way to navigate except the breadcrumb), and remove the footer from `SeoContent.tsx`.
- **Footer layout:** 4 columns on desktop, stacked on mobile. Top border 1 px `var(--line)`, padding `4rem 0 2rem`, text 0.875 rem.
  1. **Brand:** the logo, the line "Free, private PNG to SVG converter. Files never leave your browser.", and © year.
  2. **Converters:** PNG to SVG, PNG to EPS, PNG to DXF, plus JPG to SVG and Image to SVG (after S4).
  3. **Guides:** How to convert PNG to SVG, PNG vs SVG, What is vectorization, All guides.
  4. **Company:** About, Privacy Policy, Terms of Use, FAQ.
- **Done when:** every page, including 404, has the same header and footer, and the footer has 12+ internal links.

### L6. New homepage sections (below the workspace, in this order)

Replace the current `SeoContent` layout with these sections. Keep the existing copy where noted, and style each one per L1.

1. **"See the difference"**: a before/after gallery. There are 3 cards, one for each sample in H3. Each card has a small compare slider (reuse the W2 component with a static PNG and SVG), a title, and a one-line description. Give every image descriptive `alt` text. This is the first content with images anywhere on the site (the whole site has 0 `<img>` in its content today).
2. **"How it works"**: keep the 3 steps. Add a lucide icon in each number circle (`Upload`, `SlidersHorizontal`, `Download`), and update step 2's copy to match W4: "Pick a preset or fine-tune the advanced settings, then compare the original and the vector side by side."
3. **"Why PNG2SVG.IO"**: a 3×2 feature grid with a 24 px lucide icon in blue, an H3, and one sentence each:
   - `ShieldCheck` **Private by design**: "Conversion runs on your device. Nothing is uploaded, ever."
   - `Target` **Pixel-perfect output**: "At its original size, the SVG matches your PNG pixel for pixel."
   - `Layers` **Layered by color**: "Every color is its own layer, ready for Cricut, Silhouette, and laser software."
   - `Files` **Batch conversion**: "Drop a whole folder of images and download everything as a ZIP."
   - `FileType` **SVG, EPS, and DXF**: "Get all three formats from a single conversion."
   - `WifiOff` **Works offline**: "Once the page has loaded, you can convert without a connection."
   - **Owner must confirm the pixel-perfect and offline claims are true before shipping.** Pixel-perfect is true for flat art after the engine fixes in `feedback.md`. If a claim is not true yet, drop that card.
4. **"Made for your workflow"**: 4 use-case cards, each linking to a page:
   - "Cricut & Silhouette" → `/svg-for-cricut` (S4)
   - "Laser cutting & CNC" → `/png-to-dxf`
   - "Print & logos" → `/png-to-eps`
   - "Web & apps" → `/guides/png-vs-svg`
5. **FAQ**: keep it, with B4 fixed, as a **native `<details>` accordion** (each question is a `<summary>`) so the section is shorter. Show only 5 questions and end with a link "More questions → FAQ". **Don't reuse the exact same questions as `/faq`**; see S3.
6. **"Converters and guides"**: keep it, but fold it into the footer columns (L5) and remove it as a section. It duplicates L6.4 and the footer.

### L7. Dark theme polish

- The dark hero reads as a flat black box. With H1/H2 it gets content. Also make the canvas card in dark mode `var(--bg-elevated)` with a 1 px `color-mix(in srgb, white 8%, transparent)` border, so cards separate from the page background.
- Check that every swatch, the checkerboard, and the orange CTA are visible in dark mode.

### L8. Motion

- Add hover lift on cards (`transform: translateY(-2px)`, shadow `--shadow-md`, 150 ms).
- Add a fade-in for the conversion result (200 ms opacity).
- Wrap all animations in `@media (prefers-reduced-motion: no-preference)`. The existing pending-state orbit and scanline animations must also respect it.

---

## SEO

### S1. Converter landing pages must contain the converter

- **Problem:** `/png-to-eps` and `/png-to-dxf` have the H1 "Free PNG to EPS Converter" but no converter, just an article and a "Convert a PNG now" link to `/`. A visitor from Google searching "png to eps converter" has to click again, and search engines can see the page doesn't do what its title says.
- **Do:**
  - Give `ConverterApp` an optional prop `defaultFormat?: "svg" | "eps" | "dxf"`. It sets which format the W1 split button's main part downloads, for example `Download EPS · 1.1 MB`, with the others in the dropdown.
  - Build each landing page from: shared header, a compact hero (H1 from the page, a one-line lede, 360 px dropzone), the `ConverterApp` workspace, and then the existing article content below as a `<section>` with the prose width.
  - Remove the "Try the free converter" CTA box from these two pages; it's redundant now. `ArticleLayout` renders it unconditionally, so add a `showCta?: boolean` prop (default `true`) and pass `showCta={false}`.
  - Keep each page's unique copy, FAQ, and metadata.

### S2. Metadata and structured data

- **Where:** `app/layout.tsx`, `app/page.tsx`.
- **Do:**
  - **Home title** (`title.default`): `Free PNG to SVG Converter: Pixel-Perfect, No Upload`. Home description, 150-160 characters: `Convert PNG to SVG free in your browser. Pixel-perfect layered vectors for Cricut, laser cutting and print. Also exports EPS and DXF. No upload, no sign-up.`
  - Delete the `keywords` array. Google ignores it.
  - Replace `webAppJsonLd` with an `@graph` containing:
    - `Organization`: `name`, `url`, `logo: "https://png2svg.io/icon.svg"`.
    - `WebSite`: `name`, `url`.
    - `WebApplication`: existing fields plus `isAccessibleForFree: true`, `browserRequirements: "Requires JavaScript and WebAssembly"`, `featureList: ["PNG to SVG","PNG to EPS","PNG to DXF","Batch conversion","Runs locally in the browser"]`, and `screenshot: "https://png2svg.io/og-image.png"`.
  - **`HowTo` JSON-LD** on `/guides/how-to-convert-png-to-svg`: Google retired HowTo rich results in 2023. It does no harm, but don't add more of it.
  - **`FAQPage` JSON-LD**: Google only shows FAQ rich results for authoritative government and health sites since 2023. Keep the markup, but don't count on it for traffic.
  - `app/sitemap.ts`: `lastModified: new Date()` stamps every page with the build time on every deploy, which teaches Google to ignore the dates. Store a real `lastModified` date string per entry and update it only when that page's content changes.
- **Per-page Open Graph images:** at least give `/png-to-eps`, `/png-to-dxf`, and each guide their own `openGraph.images`. Use `next/og` `ImageResponse` in an `opengraph-image.tsx` per route, with the page title on the brand background.

### S3. Duplicate content

- **Problem:** the homepage FAQ and `/faq` share questions and answers word for word, and both output `FAQPage` JSON-LD.
- **Do:** give the homepage 5 short, conversion-focused questions: free, private, Cricut, formats, and "What images work best?". Give `/faq` the full, longer set. Only `/faq` outputs the `FAQPage` JSON-LD; remove it from `SeoContent.tsx`.
- **Content accuracy:** the copy tells users to "raise the color count" and "raise the detail setting" (`SeoContent.tsx` FAQ, `/png-to-eps` "How to convert" and "Tips"). Those controls don't exist. After W4, change that copy to reference the real preset names ("Choose the Illustration preset for detailed artwork, or Logo / flat art for simple shapes").

### S4. New landing pages (the biggest SEO growth lever)

Each page is built like S1 (converter on top, 800-1,200 words of **unique** content below, its own FAQ of 4 questions, canonical, a sitemap entry, a footer link, and a link from at least one related page). **Don't** copy-paste the EPS page and change the nouns: search engines treat near-duplicate pages as low quality. Each needs genuinely specific sections.

| Route | H1 | Unique content to cover |
|---|---|---|
| `/jpg-to-svg` (needs W6) | Free JPG to SVG Converter | JPG compression artifacts and how they affect tracing; when to use the Illustration preset; photos vs artwork |
| `/image-to-svg` (needs W6) | Convert Any Image to SVG | PNG vs JPG vs WebP inputs; transparency; which images vectorize well |
| `/svg-for-cricut` | Make SVG Files for Cricut from PNG | Importing into Design Space step by step; layers → colors → cut; the Black & white preset for single-color cuts; sizing |
| `/logo-to-vector` | Convert Your Logo to a Vector | Why printers ask for vector logos; EPS vs SVG vs PDF for print; checking the result at 400% zoom |
| `/guides` (index) | Guides | A card grid of all guides. Also point the breadcrumb "Guides" at `/guides` (today it points at the how-to guide). |

Only add `webp-to-svg` or other formats once W6 ships.

### S5. Internal linking

- Every guide ends with "Related guides" (2 cards) and the converter CTA.
- In body copy, link the first mention of "SVG", "EPS", "DXF", and "Cricut" to the matching page. Once per page, and never self-link.

### S6. Performance (Core Web Vitals)

- The hero's LCP element must be the H1 text or the H2 demo image. Mark the hero demo image with `fetchPriority="high"` and `loading="eager"`, give it explicit `width`/`height`, and keep it under 60 KB (WebP).
- All ad slots must reserve their height (see A2) so they don't cause layout shift.
- Keep GA and AdSense after interactive, as they are now.

---

## Ads

**Current state:** the AdSense script is loaded on every page, but there are **no ad units** in the markup. So either nothing shows, or Auto ads (if enabled in the dashboard) insert ads wherever Google decides, which can include inside the converter UI, pushing the tool around and risking accidental clicks next to Download buttons. `public/ads.txt` is correct (`google.com, pub-1821039974714849, DIRECT, f08c47fec0942fa0`).

### A1. Strategy

- **Use manual units for predictable placement, and turn Auto ads off except "Anchor ads"** in the AdSense dashboard (owner task): *AdSense → Ads → By site → png2svg.io → Auto ads: on; In-page formats: off; Overlay formats: Anchor on, Vignette off.* Vignettes (full-screen ads between pages) interrupt the flow from a guide to the converter.
- The tool is the product. **Never place an ad between the dropzone or preview and the Download button**, and never within 150 px of a Download or Choose-file button. AdSense policy forbids placements that encourage accidental clicks, and it would hurt trust.
- Label every unit: a 0.6875 rem uppercase `var(--ink-soft)` label "Advertisement" above the slot.

### A2. `AdSlot` component

- **Where:** new `components/AdSlot.tsx` (client component).
- **Do:**
  ```tsx
  "use client";
  import { useEffect, useRef } from "react";

  declare global { interface Window { adsbygoogle?: unknown[] } }

  export function AdSlot({ slot, minHeight, className }: {
    slot: string;            // AdSense ad unit ID, e.g. "1234567890"
    minHeight: number;       // reserved height in px to prevent layout shift
    className?: string;
  }) {
    const pushed = useRef(false);
    useEffect(() => {
      if (pushed.current) return;
      pushed.current = true;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
    }, []);
    return (
      <aside className={className} aria-label="Advertisement" style={{ minHeight }}>
        <span className="ad-label">Advertisement</span>
        <ins
          className="adsbygoogle"
          style={{ display: "block", minHeight: minHeight - 16 }}
          data-ad-client="ca-pub-1821039974714849"
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </aside>
    );
  }
  ```
- The owner creates these display ad units in AdSense and replaces the placeholder IDs, which are kept in one `lib/ads.ts` constant: `AD_SLOTS = { homeBelowTool: "TODO", sidebarResult: "TODO", articleInline: "TODO", articleSidebar: "TODO" }`.
- `AdSlot` renders nothing when a slot ID is `"TODO"`, so nothing breaks before the units exist.

### A3. Placements

| # | Page | Position | Size | Reserve `minHeight` | Show when |
|---|---|---|---|---|---|
| 1 | Home + converter landing pages | Between the workspace and the first content section ("See the difference") | Responsive leaderboard (728×90 / 320×100) | 116 desktop, 116 mobile | Always |
| 2 | Home + converter landing pages | Sidebar, **below** the Result panel, `position: sticky; top: 88px` | 300×250 | 266 | Desktop ≥ 1100 px only, and only after at least one conversion is done (`hasImages && selectedResult`) |
| 3 | Articles and guides | After the 2nd `<h2>` in the prose | Responsive in-article | 280 | Always |
| 4 | Articles and guides | Right sidebar, sticky, beside the prose | 300×600 | 616 | Desktop ≥ 1280 px only; the article grid becomes `prose 44rem + 300px sidebar` |
| 5 | FAQ | After the 4th question | Responsive | 280 | Always |

- **No ads on:** `/privacy`, `/terms`, `/about`, the 404 page, and inside the processing, pending, or empty state of the converter.
- **Mobile:** the anchor ad (from A1) sits at the bottom. Add `padding-bottom: 96px` to `<body>` under 720 px so it never covers the Download button or the footer links.
- **For implementation:** placement 1 goes in `app/page.tsx` (and the S1 landing pages) between `<ConverterApp />` and the content sections. Placement 2 goes inside the `<aside className={styles.sidebar}>` in `ConverterApp.tsx`, after `<ResultDetail />`. For placement 3, `ArticleLayout` can't inject ads into `children` by heading count, so add an `<AdSlot>` element manually in each article page's JSX after its second `<h2>` block.

### A4. Why placement 2 is worth it

Users stay on the page while they compare and tweak settings, and a sticky 300×250 beside the result is highly viewable without interrupting the task. Showing it only after a conversion keeps the first impression clean (H1), and high viewability also raises the AdSense rate.

---

## Accessibility (quick wins; also help SEO)

- All icon-only buttons (theme toggle, remove, zoom) need `aria-label`.
- Slider range inputs in Settings have empty accessible names (they're inside a `<label>` whose text includes the value). Add `aria-label` with the plain-language name.
- Focus styles: every interactive element gets `:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }`.
- Color contrast: `var(--ink-soft)` #6C737C on #F6F5F3 is about 4.4:1, which is borderline. Use it only for text ≥ 14 px, or darken it to #5F666E.

---

## Implementation order

1. **P0 bugs:** B1-B8 (one PR, all small).
2. **Legal and consent:** B9, B10 (needed before scaling ad traffic).
3. **Shared chrome:** L1, L2, L3, L5 (SiteHeader and SiteFooter, tokens, container), plus H4.
4. **Hero:** H1, H2, H3 (needs the example assets).
5. **Workspace:** W1, W2, W3, W5, then W4 (the owner supplies preset values), then W6.
6. **Homepage sections:** L6, L7, L8.
7. **SEO:** S1, S2, S3, then S4 pages one per PR, then S5 and S6.
8. **Ads:** A1 (owner, in the dashboard), A2, A3.
9. **Accessibility** pass.

### Owner decisions needed (the implementer should leave TODOs and not guess)

- The contact email for `/privacy` and `/about`.
- Preset values for W4 (all except Pixel-perfect).
- AdSense ad unit IDs for A2.
- Confirmation of the claims in L6.3 (pixel-perfect, works offline).
- Which three sample images to ship in `public/examples/` (they must be owned or licensed for commercial use).
