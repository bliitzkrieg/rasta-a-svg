import type { ConversionSettings } from "@/types/vector";

export const DEFAULT_SETTINGS: ConversionSettings = {
  paletteMode: "fixed",
  paletteSize: 16,
  smoothing: 0.35,
  speckleThresholdPx: 4,
  simplifyTolerancePx: 4,
  cornerThresholdDeg: 60,
  optimizePreset: "balanced",
};
