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
          Palette Mode
          <select
            value={value.paletteMode}
            onChange={(event) =>
              onChange({
                ...value,
                paletteMode: event.target.value as ConversionSettings["paletteMode"],
              })
            }
          >
            <option value="auto">Auto</option>
            <option value="fixed">Fixed</option>
          </select>
        </label>
        <label>
          Palette Size
          <input
            type="number"
            min={2}
            max={16}
            value={value.paletteSize}
            onChange={(event) =>
              onChange({
                ...value,
                paletteSize: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          Optimization
          <select
            value={value.optimizePreset}
            onChange={(event) =>
              onChange({
                ...value,
                optimizePreset: event.target.value as ConversionSettings["optimizePreset"],
              })
            }
          >
            <option value="fidelity">Fidelity</option>
            <option value="balanced">Balanced</option>
            <option value="minimal-nodes">Minimal nodes</option>
          </select>
        </label>
        <label className="settings-sliderField">
          Smoothing ({value.smoothing.toFixed(2)})
          <input
            type="range"
            min={0}
            max={0.45}
            step={0.01}
            value={value.smoothing}
            onChange={(event) =>
              onChange({
                ...value,
                smoothing: Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          Speckle Threshold
          <input
            type="number"
            min={1}
            max={300}
            value={value.speckleThresholdPx}
            onChange={(event) =>
              onChange({
                ...value,
                speckleThresholdPx: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="settings-sliderField">
          Simplify Tolerance ({value.simplifyTolerancePx.toFixed(1)}px)
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.1}
            value={value.simplifyTolerancePx}
            onChange={(event) =>
              onChange({
                ...value,
                simplifyTolerancePx: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="settings-sliderField">
          Corner Threshold ({value.cornerThresholdDeg}deg)
          <input
            type="range"
            min={5}
            max={90}
            step={1}
            value={value.cornerThresholdDeg}
            onChange={(event) =>
              onChange({
                ...value,
                cornerThresholdDeg: Number(event.target.value),
              })
            }
          />
        </label>
      </div>
    </div>
  );
}
