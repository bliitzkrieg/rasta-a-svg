"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdSlot } from "@/components/AdSlot";
import { DownloadMenu } from "@/components/DownloadMenu";
import { HeroDropzone } from "@/components/HeroDropzone";
import { PreviewPane } from "@/components/PreviewPane";
import { QueueList } from "@/components/QueueList";
import { ResultDetail } from "@/components/ResultDetail";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useConversionWorker } from "@/hooks/useConversionWorker";
import { usePersistedPreferences } from "@/hooks/usePersistedPreferences";
import { usePreviewUrls } from "@/hooks/usePreviewUrls";
import { useServiceWorkerCleanup } from "@/hooks/useServiceWorkerCleanup";
import { downloadAsZip, downloadString } from "@/lib/download";
import { ACCEPTED_IMAGE_TYPES, baseName, byteLength, formatBytes } from "@/lib/format";
import { APP_VERSION } from "@/lib/version";
import { trackEvent } from "@/lib/analytics";
import { PRESETS, type PresetId } from "@/lib/presets";
import { makeQueueItem, withUpdated } from "@/lib/queueUtils";
import { clearAllData, deleteItemData, putFileBlob } from "@/lib/storage/indexedDb";
import { defaultPersistedState } from "@/lib/storage/localState";
import type {
  ConversionResult,
  ConversionSettings,
  ExportFormat,
  ExportType,
  PersistedAppState,
} from "@/types/vector";
import styles from "@/app/page.module.css";

/** Rejects uploads above this size before decoding; decoding a huge PNG can
 * exhaust tab memory because the full image is decoded first. */
const MAX_SOURCE_FILE_BYTES = 25 * 1024 * 1024;

/** Wait this long after the last settings change before re-converting. */
const SETTINGS_DEBOUNCE_MS = 500;

const EXAMPLE_IMAGE = { url: "/examples/logo.png", fileName: "example-fox-logo.png" };

interface ConverterAppProps {
  /** Format the main download button produces (landing pages pick EPS/DXF). */
  defaultFormat?: ExportFormat;
  /** "home": full hero with the page <h1>. "compact": landing-page dropzone. */
  hero?: "home" | "compact";
  /** Preset applied on load instead of the saved settings (the Cricut page). */
  defaultPreset?: PresetId;
}

type Toast = { kind: "success" | "error"; message: string };

const MIME: Record<ExportFormat, string> = {
  svg: "image/svg+xml",
  eps: "application/postscript",
  dxf: "application/dxf",
};

export default function ConverterApp({
  defaultFormat = "svg",
  hero = "home",
  defaultPreset,
}: ConverterAppProps) {
  const [appState, setAppState] = useState<PersistedAppState>(() => defaultPersistedState());
  const [results, setResults] = useState<Record<string, ConversionResult>>({});
  const [activePhase, setActivePhase] = useState<string>("Idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsPending, setSettingsPending] = useState(false);

  usePersistedPreferences(
    appState,
    setAppState,
    setResults,
    defaultPreset ? PRESETS.find((preset) => preset.id === defaultPreset)?.settings : undefined,
  );
  useServiceWorkerCleanup();

  useEffect(() => {
    console.log(`[PNG2SVG.IO] converter version ${APP_VERSION}`);
  }, []);

  // The queue is never restored on reload, so images and results left in
  // IndexedDB by an earlier visit are unreachable. Clear them on mount;
  // uploads wait for this so a quick first drop is never wiped.
  const storageReady = useRef<Promise<void> | null>(null);
  useEffect(() => {
    storageReady.current = clearAllData().catch(() => undefined);
  }, []);

  const selectedItem = useMemo(
    () => appState.queue.find((item) => item.id === appState.selectedId),
    [appState.queue, appState.selectedId],
  );
  const selectedResult = appState.selectedId ? results[appState.selectedId] : undefined;
  const hasImages = appState.queue.length > 0;
  const doneCount = appState.queue.filter((item) => item.status === "done").length;
  const svgBytes = useMemo(
    () => (selectedResult ? byteLength(selectedResult.svg) : undefined),
    [selectedResult],
  );
  const hasCorrections = useMemo(
    () => selectedResult?.svg.includes('<g id="pixel-corrections">') ?? false,
    [selectedResult],
  );

  const { originalUrl, vectorUrl } = usePreviewUrls(selectedItem, results);
  const { requestExport } = useConversionWorker(appState, setAppState, setResults, setActivePhase);

  const showToast = useCallback((next: Toast) => setToast(next), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === "error" ? 8000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const onFiles = useCallback(async (incoming: FileList | File[]) => {
    const all = Array.from(incoming);
    const images = all.filter((file) => ACCEPTED_IMAGE_TYPES.includes(file.type));
    const files = images.filter((file) => file.size <= MAX_SOURCE_FILE_BYTES);
    const unsupported = all.length - images.length;
    const tooLarge = images.length - files.length;
    const problems: string[] = [];
    if (unsupported > 0) {
      problems.push(
        `Skipped ${unsupported} file${unsupported === 1 ? "" : "s"} that ${unsupported === 1 ? "isn't" : "aren't"} PNG, JPG or WebP.`,
      );
    }
    if (tooLarge > 0) {
      problems.push(
        `Skipped ${tooLarge} file${tooLarge === 1 ? "" : "s"} over 25 MB. Images are traced at 1000 px on the long edge, so a smaller copy gives the same result.`,
      );
    }
    setNotice(problems.length > 0 ? problems.join(" ") : null);
    if (files.length === 0) return;

    await storageReady.current;
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
  }, []);

  const onTryExample = useCallback(async () => {
    try {
      const response = await fetch(EXAMPLE_IMAGE.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      trackEvent("example_loaded", { name: "fox-logo" });
      await onFiles([new File([blob], EXAMPLE_IMAGE.fileName, { type: "image/png" })]);
    } catch {
      setNotice("Couldn't load the example image. Check your connection and try again.");
    }
  }, [onFiles]);

  // Drop images anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setIsDraggingFiles(true);
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDraggingFiles(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setIsDraggingFiles(false);
      if (event.dataTransfer && event.dataTransfer.files.length > 0) {
        void onFiles(event.dataTransfer.files);
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

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

  // Re-trace the selected image after settings change (debounced), but only
  // when the settings it was traced with differ from the current ones.
  const stateRef = useRef(appState);
  stateRef.current = appState;
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The worker reads the settings when it flips a job to "processing", so
  // record them at that moment, once per run.
  const settingsUsedRef = useRef<Record<string, string>>({});
  const runningRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const settingsKey = JSON.stringify(appState.settings);
    for (const item of appState.queue) {
      if (item.status === "processing") {
        if (!runningRef.current.has(item.id)) {
          runningRef.current.add(item.id);
          settingsUsedRef.current[item.id] = settingsKey;
        }
      } else {
        runningRef.current.delete(item.id);
      }
    }
  }, [appState.queue, appState.settings]);

  const requeueSelected = useCallback(() => {
    const { queue, selectedId, settings } = stateRef.current;
    const item = queue.find((entry) => entry.id === selectedId);
    // Not started yet: it will be traced with the current settings anyway.
    if (!item || item.status === "queued") {
      setSettingsPending(false);
      return;
    }
    if (item.status === "processing") {
      settingsTimer.current = setTimeout(requeueSelected, 400);
      return;
    }
    setSettingsPending(false);
    if (settingsUsedRef.current[item.id] === JSON.stringify(settings)) return;
    setResults((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setAppState((current) => ({
      ...current,
      queue: withUpdated(current.queue, item.id, (entry) => ({
        ...entry,
        status: "queued",
        progress: 0,
        error: undefined,
        metrics: undefined,
        updatedAt: new Date().toISOString(),
      })),
    }));
  }, []);

  const onSettingsChange = (settings: ConversionSettings) => {
    setAppState((current) => ({ ...current, settings }));
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    if (!stateRef.current.selectedId) return;
    setSettingsPending(true);
    settingsTimer.current = setTimeout(requeueSelected, SETTINGS_DEBOUNCE_MS);
  };
  useEffect(
    () => () => {
      if (settingsTimer.current) clearTimeout(settingsTimer.current);
    },
    [],
  );

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

  const onExport = async (type: ExportType) => {
    if (!selectedItem || !selectedResult) return;
    const name = baseName(selectedItem.fileName);
    trackEvent("file_download", { format: type });
    if (type === "svg" || type === "svg-clean") {
      const svg =
        type === "svg"
          ? selectedResult.svg
          : selectedResult.svg.replace(/<g id="pixel-corrections">.*?<\/g>/s, "");
      const fileName = type === "svg" ? `${name}.svg` : `${name}-clean.svg`;
      downloadString(svg, fileName, MIME.svg);
      showToast({ kind: "success", message: `Saved ${fileName} (${formatBytes(byteLength(svg))})` });
      return;
    }
    // EPS and DXF are generated in the worker so large results don't freeze the tab.
    setExportBusy(true);
    try {
      const content = await requestExport(selectedItem.id, type, selectedResult);
      const fileName = `${name}.${type}`;
      downloadString(content, fileName, MIME[type]);
      showToast({ kind: "success", message: `Saved ${fileName} (${formatBytes(byteLength(content))})` });
    } catch (error) {
      showToast({
        kind: "error",
        message: `${type.toUpperCase()} export failed: ${error instanceof Error ? error.message : "unknown error"}`,
      });
    } finally {
      setExportBusy(false);
    }
  };

  const onDownloadAll = async () => {
    const entries: { path: string; content: string }[] = [];
    setExportBusy(true);
    try {
      for (const item of appState.queue) {
        if (item.status !== "done") continue;
        const result = results[item.id];
        if (!result) continue;
        const name = baseName(item.fileName);
        entries.push({ path: `${name}.svg`, content: result.svg });
        const [eps, dxf] = await Promise.all([
          requestExport(item.id, "eps", result),
          requestExport(item.id, "dxf", result),
        ]);
        entries.push({ path: `${name}.eps`, content: eps });
        entries.push({ path: `${name}.dxf`, content: dxf });
      }
      if (entries.length === 0) return;
      trackEvent("download_all", { file_count: entries.length / 3 });
      await downloadAsZip(entries, "png2svg-vectors.zip");
      showToast({ kind: "success", message: `Saved ${entries.length / 3} images as a ZIP` });
    } catch (error) {
      showToast({
        kind: "error",
        message: `Download all failed: ${error instanceof Error ? error.message : "unknown error"}`,
      });
    } finally {
      setExportBusy(false);
    }
  };

  const onDeleteAll = () => {
    void clearAllData();
    setResults({});
    setAppState((current) => ({ ...current, queue: [], selectedId: undefined }));
  };

  const downloadMenu = (size: "default" | "compact") => (
    <DownloadMenu
      primaryFormat={defaultFormat}
      primarySize={defaultFormat === "svg" && svgBytes != null ? formatBytes(svgBytes) : undefined}
      disabled={!selectedResult}
      busy={exportBusy}
      onExport={(type) => void onExport(type)}
      onDownloadAll={doneCount > 1 ? () => void onDownloadAll() : undefined}
      hasCorrections={hasCorrections}
      size={size}
      placement={size === "compact" ? "top" : "bottom"}
    />
  );

  return (
    <section
      className={styles.converter}
      data-hero={hero}
      aria-label="Image to vector converter"
    >
      {toast ? (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          className={styles.toast}
          data-kind={toast.kind}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className={styles.toastDismiss}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      {!hasImages ? (
        <HeroDropzone
          variant={hero}
          isDragging={isDraggingFiles}
          onFiles={(files) => void onFiles(files)}
          onTryExample={() => void onTryExample()}
        />
      ) : (
        <div className={styles.workspace}>
          <div className={styles.previewColumn}>
            <PreviewPane
              result={selectedResult}
              originalUrl={originalUrl}
              vectorUrl={vectorUrl}
              status={selectedItem?.status}
              progress={selectedItem?.progress}
              activePhase={selectedItem?.status === "processing" ? activePhase : undefined}
              sliderPosition={appState.sliderPosition}
              onSliderPositionChange={(sliderPosition) =>
                setAppState((current) => ({ ...current, sliderPosition }))
              }
              downloadControl={selectedResult ? downloadMenu("compact") : undefined}
            />
            <SettingsPanel
              value={appState.settings}
              onChange={onSettingsChange}
              updating={settingsPending || selectedItem?.status === "processing"}
            />
          </div>

          <aside className={styles.sidebar} aria-label="Images and result">
            <QueueList
              items={appState.queue}
              selectedId={appState.selectedId}
              onSelect={(id) => setAppState((current) => ({ ...current, selectedId: id }))}
              onRetry={onRetry}
              onRemove={onRemove}
              onFiles={(files) => void onFiles(files)}
              onDeleteAll={onDeleteAll}
            />
            <ResultDetail
              result={selectedResult}
              svgBytes={svgBytes}
              onUseCutPreset={() =>
                onSettingsChange(PRESETS.find((preset) => preset.id === "cricut")!.settings)
              }
              downloadControl={selectedResult ? downloadMenu("default") : undefined}
            />
            {selectedItem?.error ? (
              <p className={styles.error}>Error: {selectedItem.error}</p>
            ) : null}
            {/* Mounted once a conversion exists and kept mounted across
                re-traces, so settings tweaks never trigger new ad requests. */}
            {doneCount > 0 ? (
              <AdSlot name="sidebarResult" minHeight={266} className={styles.sidebarAd} />
            ) : null}
          </aside>
        </div>
      )}

      {isDraggingFiles ? (
        <div className={styles.dropOverlay} aria-hidden="true">
          Drop images anywhere
        </div>
      ) : null}
    </section>
  );
}
