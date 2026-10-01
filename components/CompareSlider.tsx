"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronsLeftRight } from "lucide-react";
import type { QueueStatus } from "@/types/vector";

type Zoom = "fit" | 1 | 2 | 4;
type Background = "checker" | "white" | "black";

const ZOOMS: { value: Zoom; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: 1, label: "100%" },
  { value: 2, label: "200%" },
  { value: 4, label: "400%" },
];

const BACKGROUNDS: { value: Background; label: string }[] = [
  { value: "checker", label: "Transparent" },
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
];

interface CompareSliderProps {
  originalUrl?: string;
  vectorUrl?: string;
  status?: QueueStatus;
  progress?: number;
  activePhase?: string;
  sliderPosition: number;
  onSliderPositionChange: (value: number) => void;
  /** Traced pixel size: what "100%" zoom means. */
  imageWidth?: number;
  imageHeight?: number;
  /** Download control overlaid bottom-right of the canvas. */
  downloadControl?: ReactNode;
}

export function CompareSlider({
  originalUrl,
  vectorUrl,
  status,
  progress,
  activePhase,
  sliderPosition,
  onSliderPositionChange,
  imageWidth,
  imageHeight,
  downloadControl,
}: CompareSliderProps) {
  const aspectRatio =
    imageWidth && imageHeight ? imageWidth / imageHeight : undefined;

  if (!originalUrl) return null;

  if (!vectorUrl) {
    const isQueued = status === "queued";
    const progressValue = Math.max(0, Math.min(Math.round(progress ?? 0), 100));
    const visualProgress = isQueued ? Math.max(progressValue, 8) : Math.max(progressValue, 12);
    const phaseLabel = isQueued ? "Waiting for its turn" : activePhase || "Vectorizing artwork";

    return (
      <div className="compare-wrap">
        <div
          className="compare-canvas compare-canvas-pending"
          style={aspectRatio ? { aspectRatio: `${aspectRatio}` } : undefined}
        >
          <img src={originalUrl} alt="" className="compare-base compare-base-pending" />
          <div className="compare-pendingAmbient" aria-hidden="true">
            <span className="compare-pendingGlow compare-pendingGlowPrimary" />
            <span className="compare-pendingGlow compare-pendingGlowSecondary" />
            <span className="compare-pendingGrid" />
            <span className="compare-pendingScanline" />
          </div>
          <div
            className="compare-pendingCard"
            data-status={status ?? "processing"}
            role="status"
            aria-live="polite"
          >
            <div className="compare-pendingHeader">
              <span className="empty-eyebrow">{isQueued ? "Queued" : "Vectorizing"}</span>
              <span className="compare-pendingPercent">{progressValue}%</span>
            </div>
            <div className="compare-pendingCopy">
              <h2>{isQueued ? "Your image is next in line." : "Tracing your image…"}</h2>
              <p className="muted">
                {isQueued
                  ? "Earlier images finish first. The preview appears here automatically."
                  : "Everything runs on your device. Nothing is uploaded."}
              </p>
            </div>
            <div className="compare-pendingTrack" aria-hidden="true">
              <span style={{ width: `${visualProgress}%` }} />
            </div>
            <div className="compare-pendingMeta">
              <span className="compare-pendingPhase">{phaseLabel}</span>
              <span className="compare-pendingHint">
                {isQueued ? "Starts automatically" : "Preview updates when ready"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CompareView
      originalUrl={originalUrl}
      vectorUrl={vectorUrl}
      sliderPosition={sliderPosition}
      onSliderPositionChange={onSliderPositionChange}
      imageWidth={imageWidth ?? 1000}
      imageHeight={imageHeight ?? 1000}
      downloadControl={downloadControl}
    />
  );
}

interface CompareViewProps {
  originalUrl: string;
  vectorUrl: string;
  sliderPosition: number;
  onSliderPositionChange: (value: number) => void;
  imageWidth: number;
  imageHeight: number;
  downloadControl?: ReactNode;
}

function CompareView({
  originalUrl,
  vectorUrl,
  sliderPosition,
  onSliderPositionChange,
  imageWidth,
  imageHeight,
  downloadControl,
}: CompareViewProps) {
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [background, setBackground] = useState<Background>("checker");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0, scrollLeft: 0 });
  const draggingRef = useRef(false);
  // Dragging only re-renders this view; the app state (and the persisted
  // preference) is updated once when the drag ends.
  const [position, setPosition] = useState(sliderPosition);
  const [syncedPosition, setSyncedPosition] = useState(sliderPosition);
  if (sliderPosition !== syncedPosition) {
    setSyncedPosition(sliderPosition);
    setPosition(sliderPosition);
  }
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  const updatePosition = (value: number) => {
    positionRef.current = value;
    setPosition(value);
  };

  const zoomed = zoom !== "fit";
  const contentWidth = zoomed ? imageWidth * zoom : 0;
  const contentHeight = zoomed ? imageHeight * zoom : 0;

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewport({ width: el.clientWidth, height: el.clientHeight, scrollLeft: el.scrollLeft });
  }, []);

  useEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  // Center the view when zooming in.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !zoomed) return;
    el.scrollLeft = Math.max(0, (contentWidth - el.clientWidth) / 2);
    el.scrollTop = Math.max(0, (contentHeight - el.clientHeight) / 2);
    measure();
  }, [zoom, zoomed, contentWidth, contentHeight, measure]);

  // Measured against the scroll area's inner width (excludes scrollbars),
  // the same width the clip math uses, so line and clip edge always agree.
  const positionFromClientX = (clientX: number) => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return positionRef.current;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / el.clientWidth) * 100));
  };
  const stopDragging = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    onSliderPositionChange(positionRef.current);
  };
  const dividerLeft =
    viewport.width > 0 ? `${(position / 100) * viewport.width}px` : `${position}%`;

  // Divider position in viewport px, mapped into the zoomed content.
  let clipRight: string;
  if (!zoomed) {
    clipRight = `${100 - position}%`;
  } else {
    const offsetLeft = Math.max(0, (viewport.width - contentWidth) / 2);
    const dividerInContent =
      viewport.scrollLeft + (position / 100) * viewport.width - offsetLeft;
    clipRight = `${Math.max(0, Math.min(contentWidth, contentWidth - dividerInContent))}px`;
  }

  const imageStyle = zoomed
    ? { width: contentWidth, height: contentHeight }
    : undefined;

  return (
    <div className="compare-wrap">
      <div className="compare-frame">
        <div
          className="compare-canvas compare-canvas-done"
          data-zoomed={zoomed}
          style={{ aspectRatio: `${imageWidth / imageHeight}` }}
        >
          <div
            ref={scrollRef}
            className={`compare-scroll compare-bg-${background}${background === "checker" ? " checkerboard" : ""}`}
            onScroll={measure}
            onPointerDown={(event) => {
              if (zoomed || event.button !== 0) return;
              draggingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              updatePosition(positionFromClientX(event.clientX));
            }}
            onPointerMove={(event) => {
              if (!draggingRef.current) return;
              updatePosition(positionFromClientX(event.clientX));
            }}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onLostPointerCapture={stopDragging}
          >
            <div className="compare-content" data-zoomed={zoomed}>
              <div className="compare-stack" style={imageStyle}>
                {/* The vector is the static base so it is rasterized once;
                    dragging only re-clips the cheap original on top. */}
                <img src={vectorUrl} alt="Vector preview" className="compare-base" draggable={false} />
                <div className="compare-overlay" style={{ clipPath: `inset(0 ${clipRight} 0 0)` }}>
                  <img
                    src={originalUrl}
                    alt="Original image"
                    data-pixelated={zoomed}
                    draggable={false}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="compare-divider" style={{ left: dividerLeft }} aria-hidden="true">
            <span
              className="compare-handle"
              onPointerDown={(event) => {
                event.stopPropagation();
                draggingRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!draggingRef.current) return;
                updatePosition(positionFromClientX(event.clientX));
              }}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              onLostPointerCapture={stopDragging}
            >
              <ChevronsLeftRight size={18} strokeWidth={2.4} />
            </span>
          </div>
        </div>

        <span className="compare-chip compare-chip-left">Original</span>
        <span className="compare-chip compare-chip-right">Vector</span>

        <div className="compare-toolbar" role="toolbar" aria-label="Preview options">
          <div className="compare-segment" role="group" aria-label="Zoom">
            {ZOOMS.map((item) => (
              <button
                key={item.label}
                type="button"
                aria-pressed={zoom === item.value}
                onClick={() => setZoom(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="compare-segment" role="group" aria-label="Background">
            {BACKGROUNDS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={background === item.value}
                aria-label={`${item.label} background`}
                title={`${item.label} background`}
                onClick={() => setBackground(item.value)}
              >
                <span className={`compare-swatch compare-swatch-${item.value}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        {downloadControl ? <div className="compare-download">{downloadControl}</div> : null}
      </div>
      <label className="sr-only" htmlFor="compare-range">
        Comparison position: original on the left, vector on the right
      </label>
      <input
        id="compare-range"
        className="sr-only"
        type="range"
        min={0}
        max={100}
        value={Math.round(position)}
        onChange={(event) => {
          const value = Number(event.target.value);
          updatePosition(value);
          onSliderPositionChange(value);
        }}
      />
    </div>
  );
}
