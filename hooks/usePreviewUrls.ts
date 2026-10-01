"use client";

import { useEffect, useState } from "react";
import { getFileBlob } from "@/lib/storage/indexedDb";
import type { ConversionResult, ImageQueueItem } from "@/types/vector";

/**
 * Resolves object URLs for the selected item's original blob and vector result,
 * with cleanup on change or unmount.
 *
 * The vector URL is created in an effect (not useMemo): creating object URLs
 * is a side effect, and under React Strict Mode the useMemo-plus-manual-revoke
 * pattern can revoke a URL that is still in use. The effect pattern is
 * synchronous, so there is no race, and a fresh URL is created if and only if
 * the result identity changes (e.g. regenerating in B/W mode after a color
 * conversion), so the preview can never go stale.
 */
export function usePreviewUrls(
  selectedItem: ImageQueueItem | undefined,
  results: Record<string, ConversionResult>,
): { originalUrl: string | undefined; vectorUrl: string | undefined } {
  const result = selectedItem ? results[selectedItem.id] : undefined;

  // Vector URL: created in an effect so Strict Mode cleanups revoke only the
  // URL created by that effect run.
  const [vectorUrl, setVectorUrl] = useState<string | undefined>();
  useEffect(() => {
    if (!result) {
      setVectorUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([result.previewSvg ?? result.svg], { type: "image/svg+xml" }),
    );
    setVectorUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  // Original URL: resolved async from IndexedDB. Guarded against late
  // resolutions after the selection changes.
  const [originalUrl, setOriginalUrl] = useState<string | undefined>();
  const selectedId = selectedItem?.id;
  useEffect(() => {
    if (!selectedId) {
      setOriginalUrl(undefined);
      return;
    }
    let cancelled = false;
    let url: string | undefined;
    getFileBlob(selectedId).then((blob) => {
      if (cancelled) return;
      if (blob) {
        url = URL.createObjectURL(blob);
        setOriginalUrl(url);
      } else {
        setOriginalUrl(undefined);
      }
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selectedId]);

  return { originalUrl, vectorUrl };
}
