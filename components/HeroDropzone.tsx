"use client";

import { useRef } from "react";
import { BadgeCheck, ImagePlus, Layers, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { ACCEPT_ATTRIBUTE } from "@/lib/format";
import styles from "./HeroDropzone.module.css";

interface HeroDropzoneProps {
  /** "home": full hero with the page <h1>. "compact": landing-page dropzone. */
  variant: "home" | "compact";
  isDragging: boolean;
  onFiles: (files: FileList | File[]) => void;
  onTryExample: () => void;
}

export function HeroDropzone({ variant, isDragging, onFiles, onTryExample }: HeroDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => inputRef.current?.click();

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT_ATTRIBUTE}
      multiple
      hidden
      onChange={(event) => {
        if (event.target.files && event.target.files.length > 0) {
          onFiles(event.target.files);
          event.target.value = "";
        }
      }}
    />
  );

  if (variant === "compact") {
    return (
      <div
        className={styles.compact}
        data-dragging={isDragging}
        onClick={(event) => {
          if (event.target === event.currentTarget) openPicker();
        }}
      >
        {input}
        <span className={styles.compactIcon} aria-hidden="true">
          <ImagePlus size={26} strokeWidth={1.8} />
        </span>
        <p className={styles.compactTitle}>Drop a PNG, JPG or WebP here</p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={openPicker}>
            <Upload size={18} strokeWidth={2.2} aria-hidden="true" />
            Choose images
          </button>
          <button type="button" className={styles.secondary} onClick={onTryExample}>
            Try an example
          </button>
        </div>
        <p className={styles.compactHint}>
          Free, no sign-up. Files never leave your device.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.hero} data-dragging={isDragging}>
      {input}
      <div className={styles.copy}>
        <span className={styles.eyebrow}>Free · Private · No sign-up</span>
        <h1 className={styles.title}>
          Convert PNG to SVG, <span className={styles.accent}>pixel-perfect</span> and free
        </h1>
        <p className={styles.subhead}>
          Turn logos, icons, and illustrations into clean layered SVG, EPS, and
          DXF files. Everything runs in your browser, so your images are never
          uploaded.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={openPicker}>
            <Upload size={20} strokeWidth={2.2} aria-hidden="true" />
            Choose PNG files
          </button>
          <button type="button" className={styles.secondary} onClick={onTryExample}>
            <Sparkles size={18} strokeWidth={2} aria-hidden="true" />
            Try an example
          </button>
        </div>
        <p className={styles.hint}>…or drop images anywhere on this page. PNG, JPG and WebP.</p>
        <ul className={styles.trust}>
          <li>
            <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
            Files never leave your device
          </li>
          <li>
            <BadgeCheck size={16} strokeWidth={2.2} aria-hidden="true" />
            Free, no watermark
          </li>
          <li>
            <Layers size={16} strokeWidth={2.2} aria-hidden="true" />
            SVG · EPS · DXF
          </li>
        </ul>
      </div>
      <HeroDemo />
    </div>
  );
}

/** Animated before/after of a real conversion (PNG left, its SVG right). */
function HeroDemo() {
  return (
    <figure className={styles.demo}>
      <div className={`${styles.demoCanvas} checkerboard`}>
        {/* Decorative demo images: explicit sizes avoid layout shift. */}
        <img
          src="/examples/hero-logo.png"
          alt="A fox logo as the original PNG"
          width={480}
          height={480}
          className={styles.demoImage}
          loading="eager"
        />
        <div className={styles.demoVector} aria-hidden="true">
          <img
            src="/examples/hero-logo.svg"
            alt=""
            width={480}
            height={480}
            className={styles.demoImage}
            loading="eager"
          />
        </div>
        <span className={styles.demoDivider} aria-hidden="true" />
        <span className={`${styles.demoChip} ${styles.demoChipLeft}`}>PNG</span>
        <span className={`${styles.demoChip} ${styles.demoChipRight}`}>SVG</span>
      </div>
      <figcaption className={styles.demoCaption}>
        Same fox, now a layered SVG that matches the PNG pixel for pixel.
      </figcaption>
    </figure>
  );
}
