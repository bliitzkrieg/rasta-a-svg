"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PreviewPane } from "@/components/PreviewPane";
import { QueueList } from "@/components/QueueList";
import { SettingsPanel } from "@/components/SettingsPanel";
import { UploadDropzone } from "@/components/UploadDropzone";
import { decodeBlobToImageData } from "@/lib/image/decode";
import {
  clearAllData,
  deleteItemData,
  getFileBlob,
  putFileBlob,
  putResult
} from "@/lib/storage/indexedDb";
import {
  clearPersistedState,
  defaultPersistedState,
  loadPersistedState,
  savePersistedState
} from "@/lib/storage/localState";
import type {
  ConversionResult,
  ConvertJobError,
  ConvertJobProgress,
  ConvertJobRequest,
  ConvertJobResult,
  ImageQueueItem,
  PersistedAppState
} from "@/types/vector";
import styles from "./page.module.css";

type WorkerOutMessage =
  | { type: "progress"; payload: ConvertJobProgress }
  | { type: "result"; payload: ConvertJobResult }
  | { type: "error"; payload: ConvertJobError };

function makeQueueItem(file: File): ImageQueueItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    status: "queued",
    progress: 0,
    createdAt: now,
    updatedAt: now
  };
}

function downloadString(content: string, fileName: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function withUpdated(items: ImageQueueItem[], id: string, updater: (item: ImageQueueItem) => ImageQueueItem) {
  return items.map((item) => (item.id === id ? updater(item) : item));
}

export default function HomePage() {
  const [state, setState] = useState<PersistedAppState>(defaultPersistedState);
  const [results, setResults] = useState<Record<string, ConversionResult>>({});
  const [originalUrl, setOriginalUrl] = useState<string>();
  const [vectorUrl, setVectorUrl] = useState<string>();
  const [activePhase, setActivePhase] = useState<string>("Idle");
  const [paused, setPaused] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const converterVersion = "r2v-linear-v23";

  const workerRef = useRef<Worker | null>(null);
  const processingRef = useRef<string | null>(null);

  const selectedItem = useMemo(
    () => state.queue.find((item) => item.id === state.selectedId),
    [state.queue, state.selectedId]
  );
  const selectedResult = state.selectedId ? results[state.selectedId] : undefined;

  useEffect(() => {
    const persisted = loadPersistedState();
    // Never reuse previous conversion artifacts across algorithm revisions.
    setState({
      ...defaultPersistedState(),
      settings: persisted.settings,
      sliderPosition: persisted.sliderPosition
    });
    setResults({});
    setIsOffline(!navigator.onLine);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    savePersistedState(state);
  }, [state, hydrated]);

  useEffect(() => {
    const offline = () => setIsOffline(true);
    const online = () => setIsOffline(false);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
    }
  }, []);

  useEffect(() => {
    const current = selectedItem;
    if (!current) {
      setOriginalUrl(undefined);
      setVectorUrl(undefined);
      return;
    }

    let revokedOriginal: string | undefined;
    let revokedVector: string | undefined;

    getFileBlob(current.id).then((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        revokedOriginal = url;
        setOriginalUrl(url);
      }
    });

    const result = results[current.id];
    if (result) {
      const url = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml" }));
      revokedVector = url;
      setVectorUrl(url);
    } else {
      setVectorUrl(undefined);
    }

    return () => {
      if (revokedOriginal) {
        URL.revokeObjectURL(revokedOriginal);
      }
      if (revokedVector) {
        URL.revokeObjectURL(revokedVector);
      }
    };
  }, [selectedItem, results]);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/vectorize.worker.ts", import.meta.url), {
      type: "module"
    });
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
            updatedAt: new Date().toISOString()
          }))
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
            updatedAt: new Date().toISOString()
          }))
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
            updatedAt: new Date().toISOString()
          }))
        }));
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (paused || processingRef.current) {
      return;
    }
    const next = state.queue.find((item) => item.status === "queued");
    if (!next) {
      return;
    }
    const worker = workerRef.current;
    if (!worker) {
      return;
    }

    processingRef.current = next.id;
    setState((current) => ({
      ...current,
      queue: withUpdated(current.queue, next.id, (item) => ({
        ...item,
        status: "processing",
        progress: 1,
        error: undefined,
        updatedAt: new Date().toISOString()
      }))
    }));

    void (async () => {
      try {
        const blob = await getFileBlob(next.id);
        if (!blob) {
          throw new Error("Missing source image data.");
        }
        const decoded = await decodeBlobToImageData(blob);
        const payload: ConvertJobRequest = {
          id: next.id,
          width: decoded.width,
          height: decoded.height,
          pixels: decoded.pixels,
          settings: state.settings
        };
        worker.postMessage({ type: "convert", payload });
      } catch (error) {
        processingRef.current = null;
        const messageText = error instanceof Error ? error.message : "Unexpected conversion failure.";
        setState((current) => ({
          ...current,
          queue: withUpdated(current.queue, next.id, (item) => ({
            ...item,
            status: "error",
            error: messageText,
            updatedAt: new Date().toISOString()
          }))
        }));
      }
    })();
  }, [paused, state.queue, state.settings]);

  const onFiles = async (incoming: FileList | File[]) => {
    const files = Array.from(incoming).filter((file) => file.type === "image/png");
    if (files.length === 0) {
      return;
    }

    const items = files.map((file) => makeQueueItem(file));
    await Promise.all(items.map((item, index) => putFileBlob(item.id, files[index])));

    setState((current) => ({
      ...current,
      queue: [...current.queue, ...items],
      selectedId: current.selectedId ?? items[0].id
    }));
  };

  const onRetry = (id: string) => {
    setState((current) => ({
      ...current,
      queue: withUpdated(current.queue, id, (item) => ({
        ...item,
        status: "queued",
        progress: 0,
        error: undefined,
        updatedAt: new Date().toISOString()
      }))
    }));
  };

  const onRemove = (id: string) => {
    void deleteItemData(id);
    setResults((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setState((current) => {
      const queue = current.queue.filter((item) => item.id !== id);
      return {
        ...current,
        queue,
        selectedId: current.selectedId === id ? queue[0]?.id : current.selectedId
      };
    });
  };

  const onExport = (type: "svg" | "eps" | "dxf") => {
    if (!selectedItem || !selectedResult) {
      return;
    }
    const safeName = selectedItem.fileName.replace(/\.png$/i, "");
    if (type === "svg") {
      downloadString(selectedResult.svg, `${safeName}.svg`, "image/svg+xml");
    }
    if (type === "eps") {
      downloadString(selectedResult.eps, `${safeName}.eps`, "application/postscript");
    }
    if (type === "dxf") {
      downloadString(selectedResult.dxf, `${safeName}.dxf`, "application/dxf");
    }
  };

  const onClearAll = async () => {
    await clearAllData();
    clearPersistedState();
    setResults({});
    setState(defaultPersistedState());
    setOriginalUrl(undefined);
    setVectorUrl(undefined);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Raster to Vector Lab</h1>
          <p>
            Client-side PNG to layered SVG, EPS, and DXF with offline support. Converter:{" "}
            <strong>{converterVersion}</strong>
          </p>
        </div>
        <div className={styles.badges}>
          <span data-offline={isOffline}>{isOffline ? "Offline" : "Online"}</span>
          <span>{paused ? "Queue paused" : activePhase}</span>
          <button type="button" onClick={() => setPaused((current) => !current)}>
            {paused ? "Resume queue" : "Pause queue"}
          </button>
          <button type="button" className="danger" onClick={() => void onClearAll()}>
            Clear local data
          </button>
        </div>
      </header>

      <section className={styles.grid}>
        <div className={styles.left}>
          <UploadDropzone onFiles={onFiles} />
          <QueueList
            items={state.queue}
            selectedId={state.selectedId}
            onSelect={(id) => setState((current) => ({ ...current, selectedId: id }))}
            onRetry={onRetry}
            onRemove={onRemove}
          />
          <SettingsPanel
            value={state.settings}
            onChange={(settings) => setState((current) => ({ ...current, settings }))}
          />
        </div>

        <div className={styles.right}>
          <PreviewPane
            result={selectedResult}
            originalUrl={originalUrl}
            vectorUrl={vectorUrl}
            sliderPosition={state.sliderPosition}
            onSliderPositionChange={(sliderPosition) =>
              setState((current) => ({ ...current, sliderPosition }))
            }
            onExport={onExport}
          />
          {selectedItem?.error ? <p className={styles.error}>Error: {selectedItem.error}</p> : null}
        </div>
      </section>
    </main>
  );
}




