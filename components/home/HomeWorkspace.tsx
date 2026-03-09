"use client";

import Image from "next/image";
import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
  useClerk,
} from "@clerk/nextjs";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PreviewPane } from "@/components/PreviewPane";
import { QueueList } from "@/components/QueueList";
import { ResultDetail } from "@/components/ResultDetail";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useConversionWorker } from "@/hooks/useConversionWorker";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePersistedPreferences } from "@/hooks/usePersistedPreferences";
import { usePreviewUrls } from "@/hooks/usePreviewUrls";
import { useQuotaStatus } from "@/hooks/useQuotaStatus";
import { useServiceWorkerCleanup } from "@/hooks/useServiceWorkerCleanup";
import { useTopbarHeight } from "@/hooks/useTopbarHeight";
import { downloadAsZip, downloadString } from "@/lib/download";
import {
  createQuotaReservationId,
  makeQueueItem,
  withUpdated,
} from "@/lib/queueUtils";
import {
  clearAllData,
  deleteItemData,
  putFileBlobs,
} from "@/lib/storage/indexedDb";
import { defaultPersistedState } from "@/lib/storage/localState";
import { QUOTA_BLOCKED_REASON } from "@/types/quota";
import type { QuotaAuthorizeResponse, QuotaSnapshot } from "@/types/quota";
import type { ConversionResult, PersistedAppState } from "@/types/vector";
import styles from "./HomeWorkspace.module.css";

interface HomeWorkspaceProps {
  initialQuota: QuotaSnapshot;
}

function getQuotaCopy(quota: QuotaSnapshot): string {
  if (!quota.isAuthenticated) {
    return "Sign in to start your 3 free generations per day.";
  }
  if (quota.isUnlimited) {
    return "Unlimited generations active.";
  }
  return `${quota.remainingToday} of ${quota.dailyLimit} free generations left today.`;
}

function goToPricing(): void {
  window.location.assign("/#pricing");
}

export function HomeWorkspace({ initialQuota }: HomeWorkspaceProps) {
  const [appState, setAppState] = useState<PersistedAppState>(() =>
    defaultPersistedState(),
  );
  const [results, setResults] = useState<Record<string, ConversionResult>>({});
  const [activePhase, setActivePhase] = useState<string>("Idle");
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const { isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const { quota, setQuota, error: quotaError, refreshQuota } =
    useQuotaStatus(initialQuota);
  const isOffline = useOnlineStatus();
  const dragDepthRef = useRef(0);
  const pageRef = useRef<HTMLElement | null>(null);
  const topbarRef = useRef<HTMLElement | null>(null);

  usePersistedPreferences(appState, setAppState, setResults);
  useTopbarHeight(pageRef, topbarRef);
  useServiceWorkerCleanup();

  const selectedItem = useMemo(
    () => appState.queue.find((item) => item.id === appState.selectedId),
    [appState.queue, appState.selectedId],
  );
  const selectedResult = appState.selectedId
    ? results[appState.selectedId]
    : undefined;
  const hasImages = appState.queue.length > 0;
  const awaitingQuotaCount = appState.queue.filter(
    (item) => item.status === "awaiting_quota",
  ).length;

  const { originalUrl, vectorUrl } = usePreviewUrls(selectedItem, results);

  const authorizeItem = useCallback(
    async (reservationId: string): Promise<QuotaAuthorizeResponse> => {
      const response = await fetch("/api/quota/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ reservationId }),
      });
      const payload = (await response.json()) as QuotaAuthorizeResponse;
      setQuota(payload.quota);
      return payload;
    },
    [setQuota],
  );

  useConversionWorker(
    appState,
    setAppState,
    setResults,
    setActivePhase,
    async (item) => authorizeItem(item.quotaReservationId ?? item.id),
  );

  useEffect(() => {
    if (!quota.isAuthenticated) return;
    if (!quota.isUnlimited && quota.remainingToday <= 0) return;

    setAppState((current) => {
      let changed = false;
      const updatedAt = new Date().toISOString();
      const queue = current.queue.map((item) => {
        if (item.status !== "awaiting_quota") {
          return item;
        }

        changed = true;
        return {
          ...item,
          status: "queued" as const,
          quotaBlockedReason: undefined,
          updatedAt,
        };
      });

      return changed ? { ...current, queue } : current;
    });
  }, [quota.isAuthenticated, quota.isUnlimited, quota.remainingToday]);

  const onFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const files = Array.from(incoming).filter(
        (file) => file.type === "image/png",
      );
      if (files.length === 0) return;

      if (!isSignedIn) {
        void openSignIn();
        return;
      }

      const items = files.map((file) => makeQueueItem(file));
      await putFileBlobs(
        items.map((item, index) => ({ id: item.id, blob: files[index] })),
      );

      setAppState((current) => ({
        ...current,
        queue: [...current.queue, ...items],
        selectedId: current.selectedId ?? items[0]?.id,
      }));
    },
    [isSignedIn, openSignIn],
  );

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
        quotaBlockedReason: undefined,
        progress: 0,
        error: undefined,
        updatedAt: new Date().toISOString(),
      })),
    }));
  };

  const onRegenerate = () => {
    if (!selectedItem || selectedItem.status === "processing") return;
    if (!isSignedIn) {
      void openSignIn();
      return;
    }

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
        quotaBlockedReason: undefined,
        quotaReservationId: createQuotaReservationId(),
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
        selectedId:
          current.selectedId === id ? queue[0]?.id : current.selectedId,
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
        <div className={styles.topbarLeft}>
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
          <nav className={styles.navLinks} aria-label="Workspace navigation">
            <a href="/">Home</a>
            <a href="/#pricing">Pricing</a>
          </nav>
        </div>
        <div className={styles.topbarControls}>
          <div className={styles.statusRow}>
            {isOffline ? (
              <span className={styles.statusPill} data-offline="true">
                Offline
              </span>
            ) : null}
            <span className={styles.statusPill}>{activePhase}</span>
            <span className={styles.statusPill} data-accent="true">
              {getQuotaCopy(quota)}
            </span>
          </div>
          <div className={styles.actionRow}>
            <ThemeToggle
              theme={appState.theme ?? "system"}
              onThemeChange={(theme) =>
                setAppState((current) => ({ ...current, theme }))
              }
            />
            <span className={styles.clerkControls}>
              {isSignedIn ? (
                <span className={styles.clerkAvatarWrap}>
                  <UserButton
                    appearance={{
                      elements: {
                        avatarBox: styles.clerkAvatar,
                      },
                    }}
                  />
                </span>
              ) : (
                <>
                  <SignInButton mode="modal">
                    <button type="button">Sign in</button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button type="button">Create account</button>
                  </SignUpButton>
                </>
              )}
            </span>
          </div>
        </div>
      </header>

      <section className={styles.shellHeader}>
        <div className={styles.shellIntro}>
          <span className={styles.eyebrow}>Converter</span>
          <h1>PNG to SVG, EPS, and DXF without leaving the browser.</h1>
          <p>
            Queue a batch, adjust vector settings, and process files locally. Free
            accounts get 3 generations a day. Paid plans remove the cap.
          </p>
        </div>
        <div className={styles.shellActions}>
          <a href="/" className={styles.secondaryLink}>
            Back to home
          </a>
          <button type="button" className={styles.primaryButton} onClick={goToPricing}>
            View pricing
          </button>
        </div>
      </section>

      {awaitingQuotaCount > 0 ? (
        <div className={styles.notice} data-emphasis="true">
          More files are waiting in your queue. Upgrade for unlimited, or come
          back after the daily reset to resume processing.
        </div>
      ) : null}
      {quotaError ? <div className={styles.notice}>{quotaError}</div> : null}
      {selectedItem?.quotaBlockedReason === QUOTA_BLOCKED_REASON ? (
        <div className={styles.notice}>
          This item is waiting for the next free slot. Upgrade to start the rest
          of the queue immediately.
        </div>
      ) : null}

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
            onUpgrade={goToPricing}
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
              onUpgrade={goToPricing}
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
        <div className={styles.dropOverlay}>
          {isSignedIn ? "Drop PNG files anywhere" : "Sign in to queue PNG files"}
        </div>
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
        <button
          type="button"
          className={styles.footerAction}
          onClick={() => void refreshQuota()}
        >
          Refresh quota
        </button>
      </footer>
    </main>
  );
}
