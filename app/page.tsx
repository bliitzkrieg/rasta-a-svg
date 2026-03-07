"use client";

import Image from "next/image";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { PreviewPane } from "@/components/PreviewPane";
import { QueueList } from "@/components/QueueList";
import { ResultDetail } from "@/components/ResultDetail";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { decodeBlobToImageData } from "@/lib/image/decode";
import {
  clearAllData,
  deleteItemData,
  getFileBlob,
  putFileBlob,
  putResult,
} from "@/lib/storage/indexedDb";
import {
  clearPersistedState,
  defaultPersistedState,
  loadPersistedState,
  savePersistedState,
} from "@/lib/storage/localState";
import type {
  ConversionResult,
  ConvertJobError,
  ConvertJobProgress,
  ConvertJobRequest,
  ConvertJobResult,
  ImageQueueItem,
  PersistedAppState,
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
    updatedAt: now,
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

function withUpdated(
  items: ImageQueueItem[],
  id: string,
  updater: (item: ImageQueueItem) => ImageQueueItem,
) {
  return items.map((item) => (item.id === id ? updater(item) : item));
}

export default function HomePage() {
  const [state, setState] = useState<PersistedAppState>(defaultPersistedState);
  const [results, setResults] = useState<Record<string, ConversionResult>>({});
  const [originalUrl, setOriginalUrl] = useState<string>();
  const [vectorUrl, setVectorUrl] = useState<string>();
  const [activePhase, setActivePhase] = useState<string>("Idle");
  const [isOffline, setIsOffline] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const converterVersion = "r2v-linear-v36";

  const workerRef = useRef<Worker | null>(null);
  const processingRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);
  const pageRef = useRef<HTMLElement | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);

  const selectedItem = useMemo(
    () => state.queue.find((item) => item.id === state.selectedId),
    [state.queue, state.selectedId],
  );
  const selectedResult = state.selectedId
    ? results[state.selectedId]
    : undefined;
  const hasImages = state.queue.length > 0;

  useEffect(() => {
    const persisted = loadPersistedState();
    // Never reuse previous conversion artifacts across algorithm revisions.
    setState({
      ...defaultPersistedState(),
      settings: persisted.settings,
      sliderPosition: persisted.sliderPosition,
      theme: persisted.theme ?? "system",
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
    if (typeof document === "undefined") return;
    const preference = state.theme ?? "system";
    const resolved =
      preference === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : preference;
    document.documentElement.setAttribute("data-theme", resolved);
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      document.documentElement.setAttribute(
        "data-theme",
        mq.matches ? "dark" : "light",
      );
    };
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [state.theme]);

  useEffect(() => {
    const page = pageRef.current;
    const topbar = topbarRef.current;
    if (!page || !topbar || typeof ResizeObserver === "undefined") {
      return;
    }

    const syncTopbarHeight = () => {
      page.style.setProperty("--topbar-height", `${topbar.offsetHeight}px`);
    };

    syncTopbarHeight();

    const observer = new ResizeObserver(() => {
      syncTopbarHeight();
    });

    observer.observe(topbar);
    window.addEventListener("resize", syncTopbarHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncTopbarHeight);
    };
  }, []);

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
      const url = URL.createObjectURL(
        new Blob([result.svg], { type: "image/svg+xml" }),
      );
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
    const worker = new Worker(
      new URL("../workers/vectorize.worker.ts", import.meta.url),
      {
        type: "module",
      },
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
  }, []);

  useEffect(() => {
    if (processingRef.current) {
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
        updatedAt: new Date().toISOString(),
      })),
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
          settings: state.settings,
        };
        worker.postMessage({ type: "convert", payload });
      } catch (error) {
        processingRef.current = null;
        const messageText =
          error instanceof Error
            ? error.message
            : "Unexpected conversion failure.";
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
  }, [state.queue, state.settings]);

  const onFiles = async (incoming: FileList | File[]) => {
    const files = Array.from(incoming).filter(
      (file) => file.type === "image/png",
    );
    if (files.length === 0) {
      return;
    }

    const items = files.map((file) => makeQueueItem(file));
    await Promise.all(
      items.map((item, index) => putFileBlob(item.id, files[index])),
    );

    setState((current) => ({
      ...current,
      queue: [...current.queue, ...items],
      selectedId: current.selectedId ?? items[0].id,
    }));
  };

  const dragHasFiles = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(true);
  };

  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    if (event.dataTransfer.files.length > 0) {
      void onFiles(event.dataTransfer.files);
    }
  };

  const onRetry = (id: string) => {
    setState((current) => ({
      ...current,
      queue: withUpdated(current.queue, id, (item) => ({
        ...item,
        status: "queued",
        progress: 0,
        error: undefined,
        updatedAt: new Date().toISOString(),
      })),
    }));
  };

  const onRegenerate = () => {
    if (!selectedItem || selectedItem.status === "processing") {
      return;
    }

    setResults((current) => {
      const next = { ...current };
      delete next[selectedItem.id];
      return next;
    });

    setState((current) => ({
      ...current,
      queue: withUpdated(current.queue, selectedItem.id, (item) => ({
        ...item,
        status: "queued",
        progress: 0,
        error: undefined,
        metrics: undefined,
        updatedAt: new Date().toISOString(),
      })),
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
        selectedId:
          current.selectedId === id ? queue[0]?.id : current.selectedId,
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
      downloadString(
        selectedResult.eps,
        `${safeName}.eps`,
        "application/postscript",
      );
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
    <main
      ref={pageRef}
      className={styles.page}
      data-dragging={isDraggingFiles}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header ref={topbarRef} className={styles.topbar}>
        <a href="/" className={styles.brandLink} aria-label="png2svg.io home">
          <Image
            src="/logo.png"
            alt="png2svg.io"
            width={220}
            height={48}
            className={styles.logo}
            priority
          />
        </a>
        <div className={styles.topbarControls}>
          <div className={styles.statusRow}>
            {isOffline ? (
              <span className={styles.statusPill} data-offline={isOffline}>
                Offline
              </span>
            ) : null}
            <span className={styles.statusPill}>{activePhase}</span>
            {/* <span className={styles.statusPill}>{converterVersion}</span> */}
          </div>
          <div className={styles.actionRow}>
            <ThemeToggle
              theme={state.theme ?? "system"}
              onThemeChange={(theme) =>
                setState((current) => ({ ...current, theme }))
              }
            />
            <button
              type="button"
              className="danger"
              onClick={() => void onClearAll()}
            >
              Clear data
            </button>
          </div>
        </div>
      </header>

      <section className={styles.workspace}>
        <div className={styles.previewColumn}>
          <PreviewPane
            result={selectedResult}
            originalUrl={originalUrl}
            vectorUrl={vectorUrl}
            status={selectedItem?.status}
            progress={selectedItem?.progress}
            activePhase={selectedItem?.status === "processing" ? activePhase : undefined}
            sliderPosition={state.sliderPosition}
            onExport={onExport}
            onSliderPositionChange={(sliderPosition) =>
              setState((current) => ({ ...current, sliderPosition }))
            }
          />
          {hasImages ? (
            <SettingsPanel
              value={state.settings}
              onChange={(settings) =>
                setState((current) => ({ ...current, settings }))
              }
              onRegenerate={onRegenerate}
              regenerateDisabled={
                !selectedItem ||
                selectedItem.status === "processing" ||
                selectedItem.status === "queued"
              }
            />
          ) : null}
        </div>

        <aside className={styles.sidebar}>
          <QueueList
            items={state.queue}
            selectedId={state.selectedId}
            onSelect={(id) =>
              setState((current) => ({ ...current, selectedId: id }))
            }
            onRetry={onRetry}
            onRemove={onRemove}
            onFiles={onFiles}
          />
          {hasImages ? (
            <>
              <ResultDetail result={selectedResult} onExport={onExport} />
              {selectedItem?.error ? (
                <p className={styles.error}>Error: {selectedItem.error}</p>
              ) : null}
            </>
          ) : null}
        </aside>
      </section>
      {isDraggingFiles ? (
        <div className={styles.dropOverlay}>Drop PNG files anywhere</div>
      ) : null}
    </main>
  );
}
