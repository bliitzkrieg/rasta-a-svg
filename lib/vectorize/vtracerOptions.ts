import type { ConversionSettings } from "@/types/vector";

export type VTracerMode = "spline" | "polygon" | "none";

export interface VTracerOptions {
  colorPrecision: number;
  filterSpeckle: number;
  layerDifference: number;
  cornerThreshold: number;
  lengthThreshold: number;
  maxIterations: number;
  pathPrecision: number;
  spliceThreshold: number;
  mode: VTracerMode;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toVTracerOptions(
  settings: ConversionSettings,
): VTracerOptions {
  const paletteSize = clamp(settings.paletteSize, 2, 16);
  const inverseDetail = (16 - paletteSize) / 14;
  const presetLengthFactor =
    settings.optimizePreset === "fidelity"
      ? 0.875
      : settings.optimizePreset === "minimal-nodes"
        ? 1.5
        : 1;

  const mode: VTracerMode =
    settings.optimizePreset === "minimal-nodes" ? "polygon" : "spline";

  return {
    colorPrecision: clamp(
      Math.round(
        (settings.paletteMode === "auto" ? 7 : 6) + (1 - inverseDetail) * 2,
      ),
      4,
      8,
    ),
    filterSpeckle: clamp(Math.round(settings.speckleThresholdPx), 0, 1000),
    layerDifference: clamp(
      Math.round(
        (settings.paletteMode === "auto" ? 48 : 16) +
          inverseDetail * (settings.paletteMode === "auto" ? 24 : 20),
      ),
      8,
      96,
    ),
    cornerThreshold: clamp(Math.round(settings.cornerThresholdDeg), 0, 180),
    lengthThreshold: Number(
      clamp(
        settings.simplifyTolerancePx * presetLengthFactor,
        3.5,
        12,
      ).toFixed(2),
    ),
    maxIterations:
      settings.optimizePreset === "fidelity"
        ? 12
        : settings.optimizePreset === "minimal-nodes"
          ? 6
          : 10,
    pathPrecision: 2,
    spliceThreshold: clamp(
      Math.round(10 + settings.smoothing * 100),
      0,
      180,
    ),
    mode,
  };
}
