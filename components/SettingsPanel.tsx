"use client";

import { RotateCcw } from "lucide-react";
import { PRESETS, matchPreset } from "@/lib/presets";
import { CUT_MAX_COLORS } from "@/lib/vectorize/cutFile";
import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import type { ConversionSettings } from "@/types/vector";

interface SettingsPanelProps {
  value: ConversionSettings;
  onChange: (next: ConversionSettings) => void;
  /** True while the selected image is being re-traced with new settings. */
  updating?: boolean;
}

interface SliderFieldProps {
  id: string;
  label: string;
  help: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function SliderField({ id, label, help, value, display, min, max, step, onChange }: SliderFieldProps) {
  return (
    <div className="settings-field">
      <label htmlFor={id} className="settings-label">
        {label} <span className="settings-value">{display}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span id={`${id}-help`} className="settings-help">
        {help}
      </span>
    </div>
  );
}

export function SettingsPanel({ value, onChange, updating }: SettingsPanelProps) {
  const activePreset = matchPreset(value);
  const isColor = value.clusteringMode === "color";
  const set = (patch: Partial<ConversionSettings>) => onChange({ ...value, ...patch });

  return (
    <div className="panel settings">
      <div className="settings-header">
        <h2>Settings</h2>
        <span className="settings-status" aria-live="polite">
          {updating ? "Updating preview…" : activePreset ? "" : "Custom settings"}
        </span>
      </div>

      <div className="preset-group" role="radiogroup" aria-label="Preset">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={activePreset === preset.id}
            className="preset-option"
            onClick={() => onChange(preset.settings)}
          >
            <span className="preset-label">{preset.label}</span>
            <span className="preset-description">{preset.description}</span>
          </button>
        ))}
      </div>

      {value.cutFile ? (
        <div className="settings-grid settings-cut">
          <div className="settings-field">
            <label htmlFor="setting-cut-colors" className="settings-label">
              Colors
            </label>
            <select
              id="setting-cut-colors"
              value={value.cutColors}
              aria-describedby="setting-cut-colors-help"
              onChange={(event) => set({ cutColors: Number(event.target.value) })}
            >
              <option value={0}>Auto (up to {CUT_MAX_COLORS})</option>
              {Array.from({ length: CUT_MAX_COLORS }, (_, i) => i + 1).map((count) => (
                <option key={count} value={count}>
                  {count === 1 ? "1 color (silhouette)" : `${count} colors`}
                </option>
              ))}
            </select>
            <span id="setting-cut-colors-help" className="settings-help">
              Each color is one layer and one mat in Design Space.
            </span>
          </div>

          <div className="settings-field">
            <label htmlFor="setting-cut-layering" className="settings-label">
              Layering
            </label>
            <select
              id="setting-cut-layering"
              value={value.hierarchical}
              aria-describedby="setting-cut-layering-help"
              onChange={(event) =>
                set({ hierarchical: event.target.value as ConversionSettings["hierarchical"] })
              }
            >
              <option value="stacked">Stacked</option>
              <option value="cutout">Sliced</option>
            </select>
            <span id="setting-cut-layering-help" className="settings-help">
              Stacked puts each color on a solid base layer (vinyl, HTV, paper). Sliced cuts
              pieces that don&apos;t overlap (Infusible Ink).
            </span>
          </div>

          <SliderField
            id="setting-cut-speck"
            label="Smallest piece"
            help="Pieces and holes smaller than this are dropped, so nothing is too tiny to weed."
            value={value.filterSpeckle}
            display={`${value.filterSpeckle}px`}
            min={1}
            max={16}
            step={1}
            onChange={(filterSpeckle) => set({ filterSpeckle })}
          />
        </div>
      ) : null}

      <details className="settings-advanced" hidden={value.cutFile}>
        <summary>Advanced settings</summary>
        <div className="settings-grid">
          <div className="settings-field">
            <label htmlFor="setting-color-mode" className="settings-label">
              Color mode
            </label>
            <select
              id="setting-color-mode"
              value={value.clusteringMode}
              aria-describedby="setting-color-mode-help"
              onChange={(event) =>
                set({ clusteringMode: event.target.value as ConversionSettings["clusteringMode"] })
              }
            >
              <option value="color">Full color</option>
              <option value="binary">Black &amp; white</option>
            </select>
            <span id="setting-color-mode-help" className="settings-help">
              Full color keeps every color. Black &amp; white makes a one-color cut file.
            </span>
          </div>

          <div className="settings-field">
            <label htmlFor="setting-stacking" className="settings-label">
              Shape stacking
            </label>
            <select
              id="setting-stacking"
              value={value.hierarchical}
              disabled={!isColor}
              aria-describedby="setting-stacking-help"
              onChange={(event) =>
                set({ hierarchical: event.target.value as ConversionSettings["hierarchical"] })
              }
            >
              <option value="stacked">Stacked</option>
              <option value="cutout">Cutout</option>
            </select>
            <span id="setting-stacking-help" className="settings-help">
              Stacked layers shapes on top of each other. Cutout cuts holes so shapes don&apos;t overlap.
            </span>
          </div>

          <div className="settings-field">
            <label htmlFor="setting-edge" className="settings-label">
              Edge style
            </label>
            <select
              id="setting-edge"
              value={value.mode}
              aria-describedby="setting-edge-help"
              onChange={(event) => set({ mode: event.target.value as ConversionSettings["mode"] })}
            >
              <option value="spline">Exact (default)</option>
              <option value="polygon">Simplified</option>
              <option value="none">Pixel</option>
            </select>
            <span id="setting-edge-help" className="settings-help">
              Simplified uses fewer points for a smaller file, but isn&apos;t pixel-exact.
            </span>
          </div>

          <SliderField
            id="setting-speck"
            label="Remove specks smaller than"
            help="Drops tiny spots. 1 keeps every pixel."
            value={value.filterSpeckle}
            display={`${value.filterSpeckle}px`}
            min={0}
            max={16}
            step={1}
            onChange={(filterSpeckle) => set({ filterSpeckle })}
          />

          {isColor ? (
            <SliderField
              id="setting-color-detail"
              label="Color detail"
              help="Higher keeps more distinct colors."
              value={value.colorPrecision}
              display={String(value.colorPrecision)}
              min={1}
              max={8}
              step={1}
              onChange={(colorPrecision) => set({ colorPrecision })}
            />
          ) : null}

          {isColor ? (
            <SliderField
              id="setting-merge"
              label="Color merge threshold"
              help="Higher merges similar shades into one layer."
              value={value.layerDifference}
              display={String(value.layerDifference)}
              min={0}
              max={255}
              step={1}
              onChange={(layerDifference) => set({ layerDifference })}
            />
          ) : null}

          <SliderField
            id="setting-precision"
            label="Decimal places"
            help="Coordinate precision in the file. Lower is smaller."
            value={value.pathPrecision}
            display={String(value.pathPrecision)}
            min={0}
            max={16}
            step={1}
            onChange={(pathPrecision) => set({ pathPrecision })}
          />
        </div>
        <button
          type="button"
          className="settings-reset"
          onClick={() => onChange(DEFAULT_SETTINGS)}
          disabled={activePreset === "pixel-perfect"}
        >
          <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
          Reset to defaults
        </button>
      </details>
    </div>
  );
}
