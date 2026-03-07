"use client";

import type { QueueStatus } from "@/types/vector";
import { ExportButtons } from "./ExportButtons";

interface CompareSliderProps {
  originalUrl?: string;
  vectorUrl?: string;
  status?: QueueStatus;
  progress?: number;
  activePhase?: string;
  sliderPosition: number;
  onSliderPositionChange: (value: number) => void;
  aspectRatio?: number;
  onExport: (type: "svg" | "eps" | "dxf") => void;
}

export function CompareSlider({
  originalUrl,
  vectorUrl,
  status,
  progress,
  activePhase,
  sliderPosition,
  onSliderPositionChange,
  aspectRatio,
  onExport,
}: CompareSliderProps) {
  if (!originalUrl) {
    return (
      <div className="compare-wrap compare-empty">
        <div className="compare-canvas compare-canvas-empty">
          <div className="empty-state">
            <div className="empty-stateAmbient" aria-hidden="true">
              <span className="empty-stateGlow empty-stateGlowPrimary" />
              <span className="empty-stateGlow empty-stateGlowSecondary" />
              <span className="empty-stateGrid" />
              <span className="empty-stateBeam" />
              <span className="empty-stateOrbit empty-stateOrbitA" />
              <span className="empty-stateOrbit empty-stateOrbitB" />
            </div>
            <div className="empty-stateContent">
              <span className="empty-eyebrow">Raster in. Vector out.</span>
              <h2>Turn PNGs into clean, layered vectors in seconds.</h2>
              <div className="muted">
                Drop your files anywhere to get started.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <img
            src={originalUrl}
            alt="Original PNG"
            className="compare-base compare-base-pending"
          />
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
              <span className="empty-eyebrow">
                {isQueued ? "Queued" : "Vectorizing"}
              </span>
              <span className="compare-pendingPercent">{progressValue}%</span>
            </div>
            <div className="compare-pendingOrbital" aria-hidden="true">
              <span className="compare-pendingCore" />
              <span className="compare-pendingOrbit compare-pendingOrbitA" />
              <span className="compare-pendingOrbit compare-pendingOrbitB" />
              <span className="compare-pendingOrbitDot compare-pendingOrbitDotA" />
              <span className="compare-pendingOrbitDot compare-pendingOrbitDotB" />
            </div>
            <div className="compare-pendingCopy">
              <h2>
                {isQueued ? "Your image is lined up for conversion." : "Rebuilding clean vector layers."}
              </h2>
              <p className="muted">
                {isQueued
                  ? "The renderer is finishing earlier items first, then your live SVG preview will appear here automatically."
                  : "We are quantizing colors, tracing regions, and shaping export-ready paths behind the scenes."}
              </p>
            </div>
            <div className="compare-pendingTrack" aria-hidden="true">
              <span style={{ width: `${visualProgress}%` }} />
            </div>
            <div className="compare-pendingMeta">
              <span className="compare-pendingPhase">{phaseLabel}</span>
              <span className="compare-pendingHint">
                {isQueued ? "Auto-starts next" : "Preview updates when ready"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="compare-wrap">
      <div
        className="compare-canvas"
        style={aspectRatio ? { aspectRatio: `${aspectRatio}` } : undefined}
      >
        <div className="compare-exportFloating">
          <ExportButtons onExport={onExport} variant="floating" />
        </div>
        <img src={originalUrl} alt="Original PNG" className="compare-base" />
        <div
          className="compare-overlay"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <img src={vectorUrl} alt="Vector preview" />
        </div>
        <div
          className="compare-divider"
          style={{ left: `${sliderPosition}%` }}
        />
      </div>
      <div className="compare-meta">
        <span>
          <strong>PNG</strong>
        </span>
        <span>
          <strong>SVG</strong>
        </span>
      </div>
      <input
        aria-label="Comparison slider"
        type="range"
        min={0}
        max={100}
        value={sliderPosition}
        onChange={(event) => onSliderPositionChange(Number(event.target.value))}
      />
    </div>
  );
}
