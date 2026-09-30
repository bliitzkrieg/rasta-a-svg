"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getFileBlob } from "@/lib/storage/indexedDb";
import type { ConversionResult, ImageQueueItem } from "@/types/vector";

/**
 * Resolves object URLs for the selected item's original blob and vector result,
 * with cleanup on change or unmount.
 *
 * The vector URL is derived directly from the result object via useMemo, so it
 * can never go stale: when the conversion result changes (e.g. regenerating in
 * B/W mode after a color conversion), a fresh blob URL is created
 * synchronously during render.
 */
export function usePreviewUrls(
  selectedItem: ImageQueueItem | undefined,
  results: Record<string, ConversionResult>,
): { originalUrl: string | undefined; vectorUrl: string | undefined } {
  const result = selectedItem ? results[selectedItem.id] : undefined;

  // Vector URL: derived from the result object itself. A new URL is created
  // if and only if the result identity changes.
  const vectorUrl = useMemo(() => {
    if (!result) return undefined;
    return URL.createObjectURL(
      new Blob([result.svg], { type: "image/svg+xml" }),
    );
  }, [result]);

  // Revoke the previous vector URL when a new one is created, and on unmount.
  const prevVectorUrlRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevVectorUrlRef.current;
    if (prev && prev !== vectorUrl) {
      URL.revokeObjectURL(prev);
    }
    prevVectorUrlRef.current = vectorUrl;
    return () => {
      const current = prevVectorUrlRef.current;
      if (current) {
        URL.revokeObjectURL(current);
        prevVectorUrlRef.current = undefined;
      }
    };
  }, [vectorUrl]);

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
