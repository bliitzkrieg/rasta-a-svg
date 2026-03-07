"use client";

import { useEffect, type RefObject } from "react";

/**
 * Syncs the topbar height to a CSS variable on the page element for layout.
 */
export function useTopbarHeight(
  pageRef: RefObject<HTMLElement | null>,
  topbarRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const page = pageRef.current;
    const topbar = topbarRef.current;
    if (!page || !topbar || typeof ResizeObserver === "undefined") return;

    const sync = () => {
      page.style.setProperty("--topbar-height", `${topbar.offsetHeight}px`);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(topbar);
    window.addEventListener("resize", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [pageRef, topbarRef]);
}
