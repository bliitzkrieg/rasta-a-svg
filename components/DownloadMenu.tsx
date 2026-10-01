"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import type { ExportFormat, ExportType } from "@/types/vector";
import styles from "./DownloadMenu.module.css";

interface DownloadMenuProps {
  /** Format the main button downloads (landing pages pick EPS/DXF). */
  primaryFormat: ExportFormat;
  /** Size label for the primary download, e.g. "1.2 MB". */
  primarySize?: string;
  disabled?: boolean;
  busy?: boolean;
  onExport: (type: ExportType) => void;
  /** Shown when more than one image is done. */
  onDownloadAll?: () => void;
  /** Visual size: the floating copy on the canvas is a bit smaller. */
  size?: "default" | "compact";
  /** Open the menu above the button (inside the preview canvas). */
  placement?: "top" | "bottom";
  /** The SVG has a pixel-correction layer, so a clean download differs. */
  hasCorrections?: boolean;
}

const FORMAT_LABEL: Record<ExportFormat, string> = {
  svg: "SVG",
  eps: "EPS",
  dxf: "DXF",
};

export function DownloadMenu({
  primaryFormat,
  primarySize,
  disabled,
  busy,
  onExport,
  onDownloadAll,
  size = "default",
  placement = "bottom",
  hasCorrections = false,
}: DownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (type: ExportType) => {
    setOpen(false);
    onExport(type);
  };

  const otherFormats = (["svg", "eps", "dxf"] as const).filter(
    (format) => format !== primaryFormat,
  );

  return (
    <div className={styles.root} data-size={size} ref={rootRef}>
      <button
        type="button"
        className={styles.primary}
        disabled={disabled || busy}
        onClick={() => onExport(primaryFormat)}
      >
        <Download size={size === "compact" ? 16 : 18} strokeWidth={2.2} aria-hidden="true" />
        <span>
          {busy ? "Preparing…" : `Download ${FORMAT_LABEL[primaryFormat]}`}
        </span>
        {primarySize && !busy ? (
          <span className={styles.size}>{primarySize}</span>
        ) : null}
      </button>
      <button
        type="button"
        className={styles.toggle}
        disabled={disabled || busy}
        aria-label="More download options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" />
      </button>
      {open ? (
        <div id={menuId} role="menu" className={styles.menu} data-placement={placement}>
          {otherFormats.map((format) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => choose(format)}
            >
              Download {FORMAT_LABEL[format]}
              <span className={styles.hint}>
                {format === "svg"
                  ? "Web, design apps"
                  : format === "eps"
                    ? "Print, Illustrator"
                    : "Laser, CNC, CAD"}
              </span>
            </button>
          ))}
          {hasCorrections ? (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => choose("svg-clean")}
            >
              Download clean SVG
              <span className={styles.hint}>
                Without the pixel-correction layer, for editing
              </span>
            </button>
          ) : null}
          {onDownloadAll ? (
            <>
              <div className={styles.separator} role="separator" />
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  setOpen(false);
                  onDownloadAll();
                }}
              >
                Download all (ZIP)
                <span className={styles.hint}>SVG, EPS and DXF for every image</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
