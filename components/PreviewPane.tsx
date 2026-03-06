"use client";

import type { ConversionResult } from "@/types/vector";
import { CompareSlider } from "./CompareSlider";
import { ExportButtons } from "./ExportButtons";

interface PreviewPaneProps {
  result?: ConversionResult;
  originalUrl?: string;
  vectorUrl?: string;
  sliderPosition: number;
  onSliderPositionChange: (value: number) => void;
  onExport: (type: "svg" | "eps" | "dxf") => void;
}

export function PreviewPane({
  result,
  originalUrl,
  vectorUrl,
  sliderPosition,
  onSliderPositionChange,
  onExport
}: PreviewPaneProps) {
  return (
    <div className="panel preview">
      <h2>Preview & Compare</h2>
      <CompareSlider
        originalUrl={originalUrl}
        vectorUrl={vectorUrl}
        sliderPosition={sliderPosition}
        onSliderPositionChange={onSliderPositionChange}
        aspectRatio={result ? result.width / result.height : undefined}
      />
      {result ? (
        <>
          <div className="stats">
            <span>{result.metrics.nodeCount} nodes</span>
            <span>{result.metrics.pathCount} paths</span>
            <span>{result.metrics.elapsedMs} ms</span>
          </div>
          <div className="layers">
            {result.layers.map((layer) => (
              <div key={layer.name} className="layer-row">
                <span className="swatch" style={{ backgroundColor: layer.color }} />
                <span>{layer.name}</span>
                <span>{layer.paths.length} paths</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">No vector result yet.</p>
      )}
      <ExportButtons disabled={!result} onExport={onExport} />
    </div>
  );
}
