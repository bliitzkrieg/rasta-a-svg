"use client";

import { useEffect, useState } from "react";
import { getFileBlob } from "@/lib/storage/indexedDb";
import type { ConversionResult, ImageQueueItem } from "@/types/vector";

/**
 * Resolves object URLs for the selected item's original blob and vector result,
 * with cleanup on change or unmount.
 */
export function usePreviewUrls(
  selectedItem: ImageQueueItem | undefined,
  results: Record<string, ConversionResult>,
): { originalUrl: string | undefined; vectorUrl: string | undefined } {
  const [originalUrl, setOriginalUrl] = useState<string | undefined>();
  const [vectorUrl, setVectorUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!selectedItem) {
      setOriginalUrl(undefined);
      setVectorUrl(undefined);
      return;
    }

    let revokedOriginal: string | undefined;
    let revokedVector: string | undefined;

    getFileBlob(selectedItem.id).then((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        revokedOriginal = url;
        setOriginalUrl(url);
      }
    });

    const result = results[selectedItem.id];
    if (result) {
      const url = URL.createObjectURL(
        new Blob([result.svg], { type: "image/svg+xml" }),
      );
      revokedVector = url;
      setVectorUrl(url);
    } else {
      setVectorUrl(undefined);
    }

    return () => {
      if (revokedOriginal) URL.revokeObjectURL(revokedOriginal);
      if (revokedVector) URL.revokeObjectURL(revokedVector);
    };
  }, [selectedItem, results]);

  return { originalUrl, vectorUrl };
}
