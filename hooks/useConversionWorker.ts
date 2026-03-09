"use client";

import { useEffect, useRef } from "react";
import { decodeBlobToImageData } from "@/lib/image/decode";
import { getFileBlob, putResult } from "@/lib/storage/indexedDb";
import { withUpdated } from "@/lib/queueUtils";
import { QUOTA_BLOCKED_REASON } from "@/types/quota";
import type {
  ConversionResult,
  ConvertJobError,
  ConvertJobProgress,
  ConvertJobRequest,
  ConvertJobResult,
  ImageQueueItem,
  PersistedAppState,
} from "@/types/vector";
import type { QuotaAuthorizeResponse } from "@/types/quota";

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
  authorizeItem: (item: ImageQueueItem) => Promise<QuotaAuthorizeResponse>,
): void {
  const workerRef = useRef<Worker | null>(null);
  const processingRef = useRef<string | null>(null);

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
    setActivePhase("Checking quota");

    void (async () => {
      try {
        const authorization = await authorizeItem(next);
        if (!authorization.granted) {
          processingRef.current = null;
          setActivePhase("Idle");

          if (authorization.reason === "LIMIT_REACHED") {
            setState((current) => {
              let shouldBlockRemainder = false;
              const updatedAt = new Date().toISOString();

              return {
                ...current,
                queue: current.queue.map((item) => {
                  if (item.id === next.id) {
                    shouldBlockRemainder = true;
                    return {
                      ...item,
                      status: "awaiting_quota",
                      quotaBlockedReason: QUOTA_BLOCKED_REASON,
                      progress: 0,
                      updatedAt,
                    };
                  }

                  if (
                    shouldBlockRemainder &&
                    (item.status === "queued" || item.status === "awaiting_quota")
                  ) {
                    return {
                      ...item,
                      status: "awaiting_quota",
                      quotaBlockedReason: QUOTA_BLOCKED_REASON,
                      progress: 0,
                      updatedAt,
                    };
                  }

                  return item;
                }),
              };
            });
            return;
          }

          setState((current) => ({
            ...current,
            queue: withUpdated(current.queue, next.id, (item) => ({
              ...item,
              status: "error",
              error: "Sign in to start processing queued files.",
              updatedAt: new Date().toISOString(),
            })),
          }));
          return;
        }

        setState((current) => ({
          ...current,
          queue: withUpdated(current.queue, next.id, (item) => ({
            ...item,
            status: "processing",
            progress: 1,
            error: undefined,
            quotaBlockedReason: undefined,
            updatedAt: new Date().toISOString(),
          })),
        }));

        const blob = await getFileBlob(next.id);
        if (!blob) throw new Error("Missing source image data.");
        const decoded = await decodeBlobToImageData(blob);
        const payload: ConvertJobRequest = {
          id: next.id,
          width: decoded.width,
          height: decoded.height,
          pixels: decoded.pixels,
          settings: state.settings,
        };
        worker.postMessage({ type: "convert", payload });
      } catch (error) {
        processingRef.current = null;
        setActivePhase("Idle");
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
  }, [authorizeItem, setActivePhase, setState, state.queue, state.settings]);
}
