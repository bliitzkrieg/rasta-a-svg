"use client";

import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, AD_SLOTS, isAdSlotConfigured, type AdSlotName } from "@/lib/ads";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface AdSlotProps {
  /** Which placement (see lib/ads.ts). */
  name: AdSlotName;
  /** Reserved height in px, so the ad never shifts the layout. */
  minHeight: number;
  className?: string;
}

/**
 * One labelled AdSense unit with reserved space. Renders nothing until the
 * placement has a real slot ID in lib/ads.ts.
 */
export function AdSlot({ name, minHeight, className }: AdSlotProps) {
  const slot = AD_SLOTS[name];
  const configured = isAdSlotConfigured(slot);
  const pushed = useRef(false);

  useEffect(() => {
    if (!configured || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ad blockers and script failures must never break the page.
    }
  }, [configured]);

  if (!configured) return null;

  return (
    <aside
      className={`ad-slot${className ? ` ${className}` : ""}`}
      aria-label="Advertisement"
      style={{ minHeight }}
    >
      <span className="ad-label">Advertisement</span>
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: minHeight - 20 }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
