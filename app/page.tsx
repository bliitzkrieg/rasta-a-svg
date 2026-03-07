"use client";

import Image from "next/image";
import { type DragEvent, useMemo, useRef, useState } from "react";
import { PreviewPane } from "@/components/PreviewPane";
import { QueueList } from "@/components/QueueList";
import { ResultDetail } from "@/components/ResultDetail";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { useConversionWorker } from "@/hooks/useConversionWorker";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePersistedPreferences } from "@/hooks/usePersistedPreferences";
import { usePreviewUrls } from "@/hooks/usePreviewUrls";
import { useServiceWorkerCleanup } from "@/hooks/useServiceWorkerCleanup";
import { useTopbarHeight } from "@/hooks/useTopbarHeight";
import { downloadAsZip, downloadString } from "@/lib/download";
import { makeQueueItem, withUpdated } from "@/lib/queueUtils";
import {
  clearAllData,
  deleteItemData,
  putFileBlob,
} from "@/lib/storage/indexedDb";
import { defaultPersistedState } from "@/lib/storage/localState";
import type { ConversionResult, PersistedAppState } from "@/types/vector";
import styles from "./page.module.css";

export default function HomePage() {
  const [appState, setAppState] = useState<PersistedAppState>(() =>
    defaultPersistedState(),
  );
  const [results, setResults] = useState<Record<string, ConversionResult>>({});
  const [activePhase, setActivePhase] = useState<string>("Idle");
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const dragDepthRef = useRef(0);
  const pageRef = useRef<HTMLElement | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);

  usePersistedPreferences(appState, setAppState, setResults);
  useTopbarHeight(pageRef, topbarRef);
  const isOffline = useOnlineStatus();
  useServiceWorkerCleanup();

  const selectedItem = useMemo(
    () => appState.queue.find((item) => item.id === appState.selectedId),
    [appState.queue, appState.selectedId],
  );
  const selectedResult = appState.selectedId
    ? results[appState.selectedId]
    : undefined;
  const hasImages = appState.queue.length > 0;

  const { originalUrl, vectorUrl } = usePreviewUrls(selectedItem, results);
  useConversionWorker(appState, setAppState, setResults, setActivePhase);

  const onFiles = async (incoming: FileList | File[]) => {
    const files = Array.from(incoming).filter(
      (file) => file.type === "image/png",
    );
    if (files.length === 0) return;

    const items = files.map((file) => makeQueueItem(file));
    await Promise.all(
      items.map((item, index) => putFileBlob(item.id, files[index])),
    );

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

  const onExport = (type: "svg" | "eps" | "dxf") => {
    if (!selectedItem || !selectedResult) return;
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

  const hasActiveProcessing = appState.queue.some(
    (item) => item.status === "processing",
  );

  const onDownloadAll = () => {
    const entries: { path: string; content: string }[] = [];
    for (const item of appState.queue) {
      if (item.status !== "done") continue;
      const result = results[item.id];
      if (!result) continue;
      const base = item.fileName.replace(/\.png$/i, "");
      entries.push({ path: `${base}.svg`, content: result.svg });
      entries.push({ path: `${base}.eps`, content: result.eps });
      entries.push({ path: `${base}.dxf`, content: result.dxf });
    }
    if (entries.length === 0) return;
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
          </div>
          <div className={styles.actionRow}>
            <ThemeToggle
              theme={appState.theme ?? "system"}
              onThemeChange={(theme) =>
                setAppState((current) => ({ ...current, theme }))
              }
            />
            <span className={styles.clerkControls}>
              <Show when="signed-out">
                <SignInButton mode="modal" />
                <SignUpButton mode="modal" />
              </Show>
              <Show when="signed-in">
                <span className={styles.clerkAvatarWrap}>
                  <UserButton
                    appearance={{
                      elements: {
                        avatarBox: styles.clerkAvatar,
                      },
                    }}
                  />
                </span>
              </Show>
            </span>
          </div>
        </div>
      </header>

      <section className={styles.workspace} data-empty={!hasImages}>
        <div className={styles.previewColumn}>
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
      <footer className={styles.footer}>
        <span>
          made with <span className={styles.footerHeart}>{"<3"}</span> by{" "}
          <a
            href="https://github.com/bliitzkrieg"
            target="_blank"
            rel="noreferrer"
            className={styles.footerLink}
          >
            Bliitzkrieg
          </a>{" "}
          (and Codex!)
        </span>
      </footer>
    </main>
  );
}
