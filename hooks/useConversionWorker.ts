"use client";

import { useEffect, useRef } from "react";
import { decodeBlobToImageData } from "@/lib/image/decode";
import { getFileBlob, putResult } from "@/lib/storage/indexedDb";
import { withUpdated } from "@/lib/queueUtils";
import { trackEvent } from "@/lib/analytics";
import type {
  ConversionResult,
  ConvertJobError,
  ConvertJobProgress,
  ConvertJobRequest,
  ConvertJobResult,
  PersistedAppState,
} from "@/types/vector";

type WorkerOutMessage =
  | { type: "progress"; payload: ConvertJobProgress }
  | { type: "result"; payload: ConvertJobResult }
  | { type: "error"; payload: ConvertJobError };

/**
 * Owns the vectorization worker: creates it, handles messages, and processes
 * the next queued item when the queue or settings change.
 */
export function useConversionWorker(
  state: PersistedAppState,
  setState: React.Dispatch<React.SetStateAction<PersistedAppState>>,
  setResults: React.Dispatch<React.SetStateAction<Record<string, ConversionResult>>>,
  setActivePhase: React.Dispatch<React.SetStateAction<string>>,
): void {
  const workerRef = useRef<Worker | null>(null);
  const processingRef = useRef<string | null>(null);
  // The worker message handler is registered once, so it reads settings
  // through a ref to avoid capturing stale values.
  const settingsRef = useRef(state.settings);
  settingsRef.current = state.settings;

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/vectorize.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        setActivePhase(message.payload.phase);
        setState((current) => ({
          ...current,
          queue: withUpdated(current.queue, message.payload.id, (item) => ({
            ...item,
            progress: message.payload.progress,
            updatedAt: new Date().toISOString(),
          })),
        }));
      }

      if (message.type === "result") {
        processingRef.current = null;
        setActivePhase("Idle");
        const { id, result } = message.payload;
        void putResult(id, result);
        setResults((current) => ({ ...current, [id]: result }));
        trackEvent("conversion_complete", {
          mode: settingsRef.current.mode,
          clustering_mode: settingsRef.current.clusteringMode,
          layers: result.layers.length,
          paths: result.metrics.pathCount,
          nodes: result.metrics.nodeCount,
        });
        setState((current) => ({
          ...current,
          queue: withUpdated(current.queue, id, (item) => ({
            ...item,
            status: "done",
            progress: 100,
            metrics: result.metrics,
            error: undefined,
            updatedAt: new Date().toISOString(),
          })),
        }));
      }

      if (message.type === "error") {
        processingRef.current = null;
        setActivePhase("Idle");
        setState((current) => ({
          ...current,
          queue: withUpdated(current.queue, message.payload.id, (item) => ({
            ...item,
            status: "error",
            error: message.payload.error,
            updatedAt: new Date().toISOString(),
          })),
        }));
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [setState, setResults, setActivePhase]);

  useEffect(() => {
    if (processingRef.current) return;
    const next = state.queue.find((item) => item.status === "queued");
    if (!next) return;
    const worker = workerRef.current;
    if (!worker) return;

    processingRef.current = next.id;
    setState((current) => ({
      ...current,
      queue: withUpdated(current.queue, next.id, (item) => ({
        ...item,
        status: "processing",
        progress: 1,
        error: undefined,
        updatedAt: new Date().toISOString(),
      })),
    }));

    void (async () => {
      try {
        const blob = await getFileBlob(next.id);
        if (!blob) throw new Error("Missing source image data.");
        const decoded = await decodeBlobToImageData(blob);
        const payload: ConvertJobRequest = {
          id: next.id,
          width: decoded.width,
          height: decoded.height,
          sourceWidth: decoded.sourceWidth,
          sourceHeight: decoded.sourceHeight,
          pixels: decoded.pixels,
          settings: state.settings,
          paletteTier: decoded.paletteTier,
          originalPixels: decoded.originalPixels,
        };
        // Transfer (not clone) the pixel buffers: they are 4 MB each at
        // 1000x1000 and are never reused on the main thread after this point.
        worker.postMessage({ type: "convert", payload }, [
          payload.pixels.buffer as ArrayBuffer,
          payload.originalPixels.buffer as ArrayBuffer,
        ]);
      } catch (error) {
        processingRef.current = null;
        const messageText =
          error instanceof Error ? error.message : "Unexpected conversion failure.";
        setState((current) => ({
          ...current,
          queue: withUpdated(current.queue, next.id, (item) => ({
            ...item,
            status: "error",
            error: messageText,
            updatedAt: new Date().toISOString(),
          })),
        }));
      }
    })();
  }, [state.queue, state.settings, setState]);
}
