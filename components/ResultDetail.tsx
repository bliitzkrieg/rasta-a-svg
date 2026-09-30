"use client";

import type { ConversionResult } from "@/types/vector";
import { ExportButtons } from "./ExportButtons";

interface ResultDetailProps {
  result?: ConversionResult;
  onExport: (type: "svg" | "svg-clean" | "eps" | "dxf") => void;
}

export function ResultDetail({ result, onExport }: ResultDetailProps) {
  return (
    <div className="panel result-panel">
      <div className="result-header">
        <h2>Result</h2>
        <ExportButtons disabled={!result} onExport={onExport} />
      </div>
      {result ? (
        <div className="result-stack">
          {result.metrics.pixelExact === "capped" && (
            <p className="muted" role="note">
              Note: this is a large, detailed image, so the pixel-correction
              layer was skipped to keep the file size reasonable. The SVG is
              very close but not pixel-exact.
            </p>
          )}
          {result.metrics.pixelExact === "simplified" && (
            <p className="muted" role="note">
              Note: Polygon curve fitting simplifies the paths, so the SVG is
              not pixel-exact. Use Spline for the most accurate result.
            </p>
          )}
          {result.metrics.pixelExact === "bw" && (
            <p className="muted" role="note">
              Note: B/W mode traces a black-and-white silhouette, so the SVG
              is not pixel-exact by design.
            </p>
          )}
          <div className="stats">
            <div className="statCard">
              <span className="statValue">{result.metrics.nodeCount}</span>
              <span className="statLabel">Nodes</span>
            </div>
            <div className="statCard">
              <span className="statValue">{result.metrics.pathCount}</span>
              <span className="statLabel">Paths</span>
            </div>
            <div className="statCard">
              <span className="statValue">{result.metrics.elapsedMs} ms</span>
              <span className="statLabel">Processing</span>
            </div>
          </div>
          <div className="layers">
            {result.layers.map((layer) => (
              <div key={layer.name} className="layer-row">
                <span
                  className="swatch"
                  style={{ backgroundColor: layer.color }}
                />
                <span>{layer.name}</span>
                <span>{layer.paths.length} paths</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted">Convert an image to see stats, layers, and export options.</p>
      )}
    </div>
  );
}
