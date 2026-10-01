"use client";

import { useState, type ReactNode } from "react";
import { formatBytes } from "@/lib/format";
import type { ConversionResult } from "@/types/vector";

interface ResultDetailProps {
  result?: ConversionResult;
  /** SVG byte size, computed once by the parent. */
  svgBytes?: number;
  downloadControl?: ReactNode;
  /** Switches the converter to the Cricut cut file preset. */
  onUseCutPreset?: () => void;
}

/** Cricut Design Space refuses SVGs with more paths than this. */
const CRICUT_MAX_PATHS = 5000;

const LAYER_PREVIEW_COUNT = 50;

const EXACT_NOTES: Record<string, string> = {
  capped:
    "This image is large and detailed, so the pixel-correction layer was skipped to keep the file size reasonable. The SVG is very close but not pixel-exact.",
  simplified:
    "This preset simplifies the shapes, so the SVG is smaller but not pixel-exact. Choose Pixel-perfect for an exact match.",
  bw: "Black & white traces a one-color silhouette, so it is not pixel-exact by design.",
  cut: "Cut file: each color is one layer in Cricut Design Space, with smooth edges and no specks too small to cut. Colors are simplified, so it is not pixel-exact.",
};

export function ResultDetail({ result, svgBytes, downloadControl, onUseCutPreset }: ResultDetailProps) {
  const [showAllLayers, setShowAllLayers] = useState(false);

  if (!result) {
    return (
      <div className="panel result-panel">
        <h2>Result</h2>
        <p className="muted">Your vector appears here when the conversion finishes.</p>
      </div>
    );
  }

  const exact = result.metrics.pixelExact;
  const note = exact ? EXACT_NOTES[exact] : undefined;
  const layers = showAllLayers ? result.layers : result.layers.slice(0, LAYER_PREVIEW_COUNT);
  const seconds = (result.metrics.elapsedMs / 1000).toFixed(1);

  return (
    <div className="panel result-panel">
      <div className="result-header">
        <h2>Result</h2>
        {exact === "exact" ? <span className="result-badge">Pixel-perfect</span> : null}
        {exact === "cut" ? <span className="result-badge">Cut-ready</span> : null}
      </div>
      {downloadControl ? <div className="result-download">{downloadControl}</div> : null}
      <dl className="stats">
        <div className="statCard">
          <dt className="statLabel">Colors</dt>
          <dd className="statValue">{result.layers.length.toLocaleString()}</dd>
        </div>
        <div className="statCard">
          <dt className="statLabel">File size</dt>
          <dd className="statValue">{svgBytes != null ? formatBytes(svgBytes) : "–"}</dd>
        </div>
        <div className="statCard">
          <dt className="statLabel">Converted in</dt>
          <dd className="statValue">{seconds} s</dd>
        </div>
      </dl>
      {note ? (
        <p className="result-note" role="note">
          {note}
          {exact === "cut" && result.metrics.backgroundRemoved
            ? " The solid background was removed."
            : null}
        </p>
      ) : null}
      {exact !== "cut" && result.metrics.pathCount > CRICUT_MAX_PATHS ? (
        <p className="result-note result-note-warning" role="note">
          This SVG has {result.metrics.pathCount.toLocaleString()} paths. Cricut Design Space
          refuses files with more than {CRICUT_MAX_PATHS.toLocaleString()}.{" "}
          {onUseCutPreset ? (
            <button type="button" className="result-note-action" onClick={onUseCutPreset}>
              Make a Cricut cut file
            </button>
          ) : null}
        </p>
      ) : null}
      <details className="layers-disclosure">
        <summary>Color layers ({result.layers.length.toLocaleString()})</summary>
        <p className="layers-meta">
          {result.metrics.pathCount.toLocaleString()} paths ·{" "}
          {result.metrics.nodeCount.toLocaleString()} nodes
        </p>
        <ul className="layers">
          {layers.map((layer, index) => (
            <li key={`${layer.name}-${index}`} className="layer-row">
              <span className="swatch" style={{ backgroundColor: layer.color }} />
              <span className="layer-hex">{layer.color.toUpperCase()}</span>
              <span>
                {layer.paths.length === 1
                  ? "1 path"
                  : `${layer.paths.length.toLocaleString()} paths`}
              </span>
            </li>
          ))}
        </ul>
        {!showAllLayers && result.layers.length > LAYER_PREVIEW_COUNT ? (
          <button type="button" className="layers-more" onClick={() => setShowAllLayers(true)}>
            Show all {result.layers.length.toLocaleString()}
          </button>
        ) : null}
      </details>
    </div>
  );
}
