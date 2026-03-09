"use client";

import { RotateCcw } from "lucide-react";
import type { ConversionSettings } from "@/types/vector";

interface SettingsPanelProps {
  value: ConversionSettings;
  onChange: (next: ConversionSettings) => void;
  onRegenerate: () => void;
  regenerateDisabled?: boolean;
}

export function SettingsPanel({
  value,
  onChange,
  onRegenerate,
  regenerateDisabled,
}: SettingsPanelProps) {
  const showColorControls = value.clusteringMode === "color";
  const showCurveControls = value.mode === "spline";

  return (
    <div className="panel settings">
      <div className="settings-header">
        <h2>Vector Settings</h2>
        <button
          type="button"
          className="settings-regenerate"
          disabled={regenerateDisabled}
          onClick={onRegenerate}
        >
          <RotateCcw size={15} strokeWidth={2.1} />
          Regenerate
        </button>
      </div>
      <div className="settings-grid">
        <label>
          Clustering
          <select
            value={value.clusteringMode}
            onChange={(event) =>
              onChange({
                ...value,
                clusteringMode:
                  event.target.value as ConversionSettings["clusteringMode"],
              })
            }
          >
            <option value="color">Color</option>
            <option value="binary">B/W</option>
          </select>
        </label>
        <label>
          Hierarchical
          <select
            value={value.hierarchical}
            disabled={!showColorControls}
            onChange={(event) =>
              onChange({
                ...value,
                hierarchical:
                  event.target.value as ConversionSettings["hierarchical"],
              })
            }
          >
            <option value="stacked">Stacked</option>
            <option value="cutout">Cutout</option>
          </select>
        </label>
        <label className="settings-sliderField">
          Filter Speckle ({value.filterSpeckle})
          <input
            type="range"
            min={0}
            max={16}
            step={1}
            value={value.filterSpeckle}
            onChange={(event) =>
              onChange({
                ...value,
                filterSpeckle: Number(event.target.value),
              })
            }
          />
        </label>
        {showColorControls ? (
          <label className="settings-sliderField">
            Color Precision ({value.colorPrecision})
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={value.colorPrecision}
              onChange={(event) =>
                onChange({
                  ...value,
                  colorPrecision: Number(event.target.value),
                })
              }
            />
          </label>
        ) : null}
        {showColorControls ? (
          <label className="settings-sliderField">
            Gradient Step ({value.layerDifference})
            <input
              type="range"
              min={0}
              max={255}
              step={1}
              value={value.layerDifference}
              onChange={(event) =>
                onChange({
                  ...value,
                  layerDifference: Number(event.target.value),
                })
              }
            />
          </label>
        ) : null}
        <label>
          Curve Fitting
          <select
            value={value.mode}
            onChange={(event) =>
              onChange({
                ...value,
                mode: event.target.value as ConversionSettings["mode"],
              })
            }
          >
            <option value="none">Pixel</option>
            <option value="polygon">Polygon</option>
            <option value="spline">Spline</option>
          </select>
        </label>
        {showCurveControls ? (
          <label className="settings-sliderField">
            Corner Threshold ({value.cornerThreshold}deg)
            <input
              type="range"
              min={0}
              max={180}
              step={1}
              value={value.cornerThreshold}
              onChange={(event) =>
                onChange({
                  ...value,
                  cornerThreshold: Number(event.target.value),
                })
              }
            />
          </label>
        ) : null}
        {showCurveControls ? (
          <label className="settings-sliderField">
            Segment Length ({value.lengthThreshold.toFixed(1)})
            <input
              type="range"
              min={3.5}
              max={10}
              step={0.5}
              value={value.lengthThreshold}
              onChange={(event) =>
                onChange({
                  ...value,
                  lengthThreshold: Number(event.target.value),
                })
              }
            />
          </label>
        ) : null}
        {showCurveControls ? (
          <label className="settings-sliderField">
            Splice Threshold ({value.spliceThreshold}deg)
            <input
              type="range"
              min={0}
              max={180}
              step={1}
              value={value.spliceThreshold}
              onChange={(event) =>
                onChange({
                  ...value,
                  spliceThreshold: Number(event.target.value),
                })
              }
            />
          </label>
        ) : null}
        <label className="settings-sliderField">
          Path Precision ({value.pathPrecision})
          <input
            type="range"
            min={0}
            max={16}
            step={1}
            value={value.pathPrecision}
            onChange={(event) =>
              onChange({
                ...value,
                pathPrecision: Number(event.target.value),
              })
            }
          />
        </label>
      </div>
    </div>
  );
}
