"use client";

import type { ConversionResult } from "@/types/vector";
import { ExportButtons } from "./ExportButtons";

interface ResultDetailProps {
  result?: ConversionResult;
  onExport: (type: "svg" | "eps" | "dxf") => void;
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
