import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import type { ConversionSettings } from "@/types/vector";

export type PresetId = "pixel-perfect" | "smaller-file" | "cricut" | "black-white";

export interface Preset {
  id: PresetId;
  label: string;
  description: string;
  settings: ConversionSettings;
}

/**
 * User-facing presets. Each maps to settings the engine handles well:
 * - Pixel-perfect: the defaults (exact pixel-edge paths plus the
 *   correction layer), so the SVG matches the image exactly.
 * - Smaller file: polygon simplification and speck removal; much smaller,
 *   not pixel-exact.
 * - Cricut cut file: a few flat colors, no background, smooth curves and
 *   one layer per color, sized in inches (lib/vectorize/cutFile.ts).
 * - Black & white: single-color silhouette with smooth edges. It is never
 *   pixel-exact, so it skips the pixel-corner walk.
 */
export const PRESETS: Preset[] = [
  {
    id: "pixel-perfect",
    label: "Pixel-perfect",
    description: "Matches your image exactly. Best quality.",
    settings: DEFAULT_SETTINGS,
  },
  {
    id: "smaller-file",
    label: "Smaller file",
    description: "Simplified shapes. Much smaller, slightly less exact.",
    settings: { ...DEFAULT_SETTINGS, mode: "polygon", filterSpeckle: 4 },
  },
  {
    id: "cricut",
    label: "Cricut cut file",
    description: "Few colors, smooth cuts, no background. One layer per color.",
    settings: { ...DEFAULT_SETTINGS, cutFile: true, cutColors: 0, filterSpeckle: 4 },
  },
  {
    id: "black-white",
    label: "Black & white",
    description: "One-color silhouette for stencils, vinyl and laser.",
    settings: { ...DEFAULT_SETTINGS, clusteringMode: "binary", exactFlatPolygons: false },
  },
];

/** Which preset the settings match exactly, or null when customized. */
export function matchPreset(settings: ConversionSettings): PresetId | null {
  // The cut file keeps its own options (colors, stacking, specks).
  if (settings.cutFile) return "cricut";
  for (const preset of PRESETS) {
    const keys = Object.keys(preset.settings) as (keyof ConversionSettings)[];
    if (keys.every((key) => settings[key] === preset.settings[key])) {
      return preset.id;
    }
  }
  return null;
}
