"use client";

import { Logo } from "./Logo";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { PreviewPane } from "@/components/PreviewPane";
import { QueueList } from "@/components/QueueList";
import { ResultDetail } from "@/components/ResultDetail";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useConversionWorker } from "@/hooks/useConversionWorker";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePersistedPreferences } from "@/hooks/usePersistedPreferences";
import { usePreviewUrls } from "@/hooks/usePreviewUrls";
import { useServiceWorkerCleanup } from "@/hooks/useServiceWorkerCleanup";
import { useTopbarHeight } from "@/hooks/useTopbarHeight";
import { downloadAsZip, downloadString } from "@/lib/download";
import { APP_VERSION } from "@/lib/version";
import { trackEvent } from "@/lib/analytics";
import { makeQueueItem, withUpdated } from "@/lib/queueUtils";
import {
  clearAllData,
  deleteItemData,
  putFileBlob,
} from "@/lib/storage/indexedDb";
import { defaultPersistedState } from "@/lib/storage/localState";
import type { ConversionResult, PersistedAppState } from "@/types/vector";
import styles from "@/app/page.module.css";

/** Rejects uploads above this size before decoding; decoding a huge PNG can
 * exhaust tab memory because createImageBitmap decodes the full image first. */
const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;

export default function ConverterApp() {
  const [appState, setAppState] = useState<PersistedAppState>(() =>
    defaultPersistedState(),
  );
  const [results, setResults] = useState<Record<string, ConversionResult>>({});
  const [activePhase, setActivePhase] = useState<string>("Idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const dragDepthRef = useRef(0);
  const pageRef = useRef<HTMLElement | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);

  usePersistedPreferences(appState, setAppState, setResults);
  useTopbarHeight(pageRef, topbarRef);
  const isOffline = useOnlineStatus();
  useServiceWorkerCleanup();

  useEffect(() => {
    console.log(`[PNG2SVG.IO] converter version ${APP_VERSION}`);
  }, []);

  const selectedItem = useMemo(
    () => appState.queue.find((item) => item.id === appState.selectedId),
    [appState.queue, appState.selectedId],
  );
  const selectedResult = appState.selectedId
    ? results[appState.selectedId]
    : undefined;
  const hasImages = appState.queue.length > 0;

  const { originalUrl, vectorUrl } = usePreviewUrls(selectedItem, results);
  const { requestExport } = useConversionWorker(appState, setAppState, setResults, setActivePhase);

  const onFiles = async (incoming: FileList | File[]) => {
    const pngs = Array.from(incoming).filter(
      (file) => file.type === "image/png",
    );
    const files = pngs.filter((file) => file.size <= MAX_SOURCE_FILE_BYTES);
    const skippedCount = pngs.length - files.length;
    if (skippedCount > 0) {
      setNotice(
        `Skipped ${skippedCount} file${skippedCount === 1 ? "" : "s"} over 25 MB. ` +
          "Large images are downscaled to 1000 px before tracing, so shrinking them first gives the same result.",
      );
    } else {
      setNotice(null);
    }
    if (files.length === 0) return;

    const items = files.map((file) => makeQueueItem(file));
    for (let i = 0; i < items.length; i++) {
      await putFileBlob(items[i].id, files[i]);
    }
    trackEvent("file_upload", { file_count: files.length });

    setAppState((current) => ({
      ...current,
      queue: [...current.queue, ...items],
      selectedId: current.selectedId ?? items[0].id,
    }));
  };

  const dragHasFiles = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(true);
  };

  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    if (event.dataTransfer.files.length > 0) {
      void onFiles(event.dataTransfer.files);
    }
  };

  const onRetry = (id: string) => {
    setAppState((current) => ({
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
    if (!selectedItem || selectedItem.status === "processing") return;
    setResults((current) => {
      const next = { ...current };
      delete next[selectedItem.id];
      return next;
    });
    setAppState((current) => ({
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
    setAppState((current) => {
      const queue = current.queue.filter((item) => item.id !== id);
      return {
        ...current,
        queue,
        selectedId: current.selectedId === id ? queue[0]?.id : current.selectedId,
      };
    });
  };

  const onExport = async (type: "svg" | "svg-clean" | "eps" | "dxf") => {
    if (!selectedItem || !selectedResult) return;
    const safeName = selectedItem.fileName.replace(/\.png$/i, "");
    trackEvent("file_download", { format: type });
    if (type === "svg") {
      downloadString(selectedResult.svg, `${safeName}.svg`, "image/svg+xml");
    }
    if (type === "eps") {
      // Generate EPS in the worker to avoid freezing the tab on large results.
      setActivePhase("Preparing EPS...");
      setExportError(null);
      try {
        const eps = await requestExport(selectedItem.id, "eps", selectedResult);
        downloadString(eps, `${safeName}.eps`, "application/postscript");
      } catch (error) {
        setExportError(
          error instanceof Error ? error.message : "EPS export failed.",
        );
      } finally {
        setActivePhase("Idle");
      }
    }
    if (type === "dxf") {
      // Generate DXF in the worker to avoid freezing the tab on large results.
      setActivePhase("Preparing DXF...");
      setExportError(null);
      try {
        const dxf = await requestExport(selectedItem.id, "dxf", selectedResult);
        downloadString(dxf, `${safeName}.dxf`, "application/dxf");
      } catch (error) {
        setExportError(
          error instanceof Error ? error.message : "DXF export failed.",
        );
      } finally {
        setActivePhase("Idle");
      }
    }
    if (type === "svg-clean") {
      // Clean SVG for cutting workflows: strips the pixel-corrections group.
      const cleanSvg = selectedResult.svg.replace(
        /<g id="pixel-corrections">.*?<\/g>/s,
        ""
      );
      downloadString(cleanSvg, `${safeName}-clean.svg`, "image/svg+xml");
    }
  };

  const hasActiveProcessing = appState.queue.some(
    (item) => item.status === "processing",
  );

  const onDownloadAll = async () => {
    const entries: { path: string; content: string }[] = [];
    setActivePhase("Preparing downloads...");
    setExportError(null);
    try {
      for (const item of appState.queue) {
        if (item.status !== "done") continue;
        const result = results[item.id];
        if (!result) continue;
        const base = item.fileName.replace(/\.png$/i, "");
        entries.push({ path: `${base}.svg`, content: result.svg });
        // Generate EPS and DXF in the worker to avoid freezing the tab.
        const [eps, dxf] = await Promise.all([
          requestExport(item.id, "eps", result),
          requestExport(item.id, "dxf", result),
        ]);
        entries.push({ path: `${base}.eps`, content: eps });
        entries.push({ path: `${base}.dxf`, content: dxf });
      }
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Download-all export failed.",
      );
      return;
    } finally {
      setActivePhase("Idle");
    }
    if (entries.length === 0) return;
    trackEvent("download_all", { file_count: entries.length / 3 });
    void downloadAsZip(entries, "processed-images.zip");
  };

  const onDeleteAll = () => {
    void clearAllData();
    setResults({});
    setAppState((current) => ({
      ...current,
      queue: [],
      selectedId: undefined,
    }));
  };

  return (
    <>
      {exportError && (
        <div
          role="alert"
          className={styles.exportErrorToast}
          onClick={() => setExportError(null)}
        >
          Export failed: {exportError} (click to dismiss)
        </div>
      )}
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
          <Logo className={styles.logo} />
        </a>
        <div className={styles.topbarControls}>
          <div className={styles.statusRow}>
            {isOffline ? (
              <span className={styles.statusPill} data-offline={isOffline}>
                Offline
              </span>
            ) : null}
            <span className={styles.statusPill}>{activePhase}</span>
          </div>
          <div className={styles.actionRow}>
            <ThemeToggle
              theme={appState.theme ?? "system"}
              onThemeChange={(theme) =>
                setAppState((current) => ({ ...current, theme }))
              }
            />
          </div>
        </div>
      </header>

      <section className={styles.workspace} data-empty={!hasImages}>
        <div className={styles.previewColumn}>
          {notice ? (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          ) : null}
          <PreviewPane
            result={selectedResult}
            originalUrl={originalUrl}
            vectorUrl={vectorUrl}
            status={selectedItem?.status}
            progress={selectedItem?.progress}
            activePhase={
              selectedItem?.status === "processing" ? activePhase : undefined
            }
            sliderPosition={appState.sliderPosition}
            onExport={onExport}
            onSliderPositionChange={(sliderPosition) =>
              setAppState((current) => ({ ...current, sliderPosition }))
            }
            onFiles={onFiles}
          />
          {hasImages ? (
            <SettingsPanel
              value={appState.settings}
              onChange={(settings) =>
                setAppState((current) => ({ ...current, settings }))
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

        {hasImages ? (
          <aside className={styles.sidebar}>
            <QueueList
              items={appState.queue}
              selectedId={appState.selectedId}
              onSelect={(id) =>
                setAppState((current) => ({ ...current, selectedId: id }))
              }
              onRetry={onRetry}
              onRemove={onRemove}
              onFiles={onFiles}
              onDownloadAll={onDownloadAll}
              onDeleteAll={onDeleteAll}
              downloadAllDisabled={hasActiveProcessing}
            />
            <>
              <ResultDetail result={selectedResult} onExport={onExport} />
              {selectedItem?.error ? (
                <p className={styles.error}>Error: {selectedItem.error}</p>
              ) : null}
            </>
          </aside>
        ) : null}
      </section>
      {isDraggingFiles ? (
        <div className={styles.dropOverlay}>Drop PNG files anywhere</div>
      ) : null}
    </main>
    </>
  );
}
